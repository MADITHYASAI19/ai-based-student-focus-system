import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentState } from '../api/client';
import type { UserCurrentState } from '../api/types';

const TOKEN_KEY = 'auth_token';
const USER_STATE_KEY = 'user_learning_state';

interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;  // true while we're reading localStorage on startup
  logout: () => void;
  setToken: (token: string) => void;
  userState: UserCurrentState | null;
  refreshUserState: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize token synchronously from localStorage so ProtectedRoute
  // never sees a false-negative on the very first render.
  const [token, setTokenState] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_KEY);
  });
  const [userState, setUserState] = useState<UserCurrentState | null>(() => {
    const cached = localStorage.getItem(USER_STATE_KEY);
    if (cached) {
      try { return JSON.parse(cached); } catch { /* ignore */ }
    }
    return null;
  });
  // isLoading stays true until the initial loadUserState() call settles,
  // so ProtectedRoute can show a spinner instead of redirecting.
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    return !!localStorage.getItem(TOKEN_KEY);
  });

  useEffect(() => {
    // If we had a token in localStorage, refresh the server-side state once.
    if (token) {
      loadUserState().finally(() => setIsLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadUserState = async () => {
    try {
      const state = await getCurrentState();
      setUserState(state);
      localStorage.setItem(USER_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to load user state:', error);
      // Keep the cached state that was already loaded synchronously above
    }
  };

  const setToken = (newToken: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setTokenState(newToken);
    setIsLoading(true);
    loadUserState().finally(() => setIsLoading(false));
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_STATE_KEY);
    setTokenState(null);
    setUserState(null);
    setIsLoading(false);
  };

  const refreshUserState = async () => {
    await loadUserState();
  };

  const value = {
    token,
    isAuthenticated: !!token,
    isLoading,
    logout,
    setToken,
    userState,
    refreshUserState,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentState } from '../api/client';
import type { UserCurrentState } from '../api/types';

const TOKEN_KEY = 'auth_token';
const USER_STATE_KEY = 'user_learning_state';

interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  logout: () => void;
  setToken: (token: string) => void;
  userState: UserCurrentState | null;
  refreshUserState: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string | null>(null);
  const [userState, setUserState] = useState<UserCurrentState | null>(null);

  useEffect(() => {
    // Load token from localStorage on mount
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      setTokenState(storedToken);
      // Load user state when token is present
      loadUserState();
    }
  }, []);

  const loadUserState = async () => {
    try {
      const state = await getCurrentState();
      setUserState(state);
      localStorage.setItem(USER_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to load user state:', error);
      // Try to load from localStorage as fallback
      const cachedState = localStorage.getItem(USER_STATE_KEY);
      if (cachedState) {
        try {
          setUserState(JSON.parse(cachedState));
        } catch (e) {
          console.error('Failed to parse cached state:', e);
        }
      }
    }
  };

  const setToken = (newToken: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setTokenState(newToken);
    // Load user state when token is set
    loadUserState();
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_STATE_KEY);
    setTokenState(null);
    setUserState(null);
  };

  const refreshUserState = async () => {
    await loadUserState();
  };

  const value = {
    token,
    isAuthenticated: !!token,
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

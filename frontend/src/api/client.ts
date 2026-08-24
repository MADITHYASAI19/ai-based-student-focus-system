import axios from 'axios';
import type {
  UserRegister,
  UserLogin,
  UserOut,
  Token,
  StudyPlanCreate,
  StudyPlanOut,
  StudySessionStart,
  StudySessionOut,
  QuizOut,
  DoubtRequest,
  DoubtAnswer,
} from './types';

// NOTE: Token storage in localStorage is a known simplification.
// TODO: Harden with httpOnly cookies for production.
const TOKEN_KEY = 'auth_token';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach auth token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token on 401 errors
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export const register = async (data: UserRegister): Promise<UserOut> => {
  const response = await apiClient.post<UserOut>('/api/auth/register', data);
  return response.data;
};

export const login = async (data: UserLogin): Promise<Token> => {
  const response = await apiClient.post<Token>('/api/auth/login', data);
  // Store token on successful login
  localStorage.setItem(TOKEN_KEY, response.data.access_token);
  return response.data;
};

export const logout = () => {
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = '/login';
};

// Planner endpoints
export const getPlan = async (studentId: number): Promise<StudyPlanOut> => {
  const response = await apiClient.get<StudyPlanOut>(`/api/plans/${studentId}`);
  return response.data;
};

export const createPlan = async (data: StudyPlanCreate): Promise<StudyPlanOut> => {
  const response = await apiClient.post<StudyPlanOut>('/api/plans', data);
  return response.data;
};

// Session endpoints
export const startSession = async (data: StudySessionStart): Promise<StudySessionOut> => {
  const response = await apiClient.post<StudySessionOut>('/api/sessions/start', data);
  return response.data;
};

export const endSession = async (sessionId: number): Promise<StudySessionOut> => {
  const response = await apiClient.patch<StudySessionOut>(`/api/sessions/${sessionId}/end`);
  return response.data;
};

// Quiz endpoint
export const getQuiz = async (topicId: number, difficulty: string = 'medium'): Promise<QuizOut> => {
  const response = await apiClient.get<QuizOut>(`/api/quizzes/${topicId}`, {
    params: { difficulty },
  });
  return response.data;
};

// Doubt endpoint
export const askDoubt = async (data: DoubtRequest): Promise<DoubtAnswer> => {
  const response = await apiClient.post<DoubtAnswer>('/api/doubts', data);
  return response.data;
};

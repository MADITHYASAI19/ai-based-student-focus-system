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
  QuizAttemptCreate,
  QuizAttemptOut,
  DoubtRequest,
  DoubtAnswer,
  Profile,
  StudyDocument,
  TopicEstimate,
  TopicBreakdownResponse,
  TopicExplainRequest,
  TopicExplainResponse,
  PlanItemOut,
  QuizConfig,
  QuizSubmission,
  AvailableTopic,
  TopicQuizStats,
  UserTopicsResponse,
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
  try {
    const response = await apiClient.post<UserOut>('/api/auth/register', data);
    return response.data;
  } catch (error: any) {
    throw error.response?.data || new Error('Failed to register user');
  }
};

export const login = async (data: UserLogin): Promise<Token> => {
  try {
    const formData = new URLSearchParams();
    formData.append('username', data.email);
    formData.append('password', data.password);

    const response = await apiClient.post<Token>('/api/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    // Store token on successful login
    localStorage.setItem(TOKEN_KEY, response.data.access_token);
    return response.data;
  } catch (error: any) {
    throw error.response?.data || new Error('Login failed');
  }
};

export const getProfile = async (): Promise<Profile> => {
  try {
    const response = await apiClient.get<Profile>('/api/auth/me/profile');
    return response.data;
  } catch (error: any) {
    throw error.response?.data || new Error('Failed to fetch profile');
  }
};

export const getTopicDocuments = async (topicId: number): Promise<StudyDocument[]> => {
  const response = await apiClient.get<StudyDocument[]>(`/api/topics/${topicId}/documents`);
  return response.data;
};

export const uploadTopicDocument = async (topicId: number, file: File): Promise<StudyDocument> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<StudyDocument>(`/api/topics/${topicId}/documents`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const uploadFocusDocument = async (file: File): Promise<StudyDocument> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<StudyDocument>('/api/topics/focus/documents', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const uploadDoubtDocument = async (file: File): Promise<StudyDocument> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<StudyDocument>('/api/doubts/documents', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const estimateTopic = async (topicName: string, file?: File): Promise<TopicEstimate> => {
  const formData = new FormData();
  formData.append('topic_name', topicName);
  if (file) formData.append('file', file);
  const response = await apiClient.post<TopicEstimate>('/api/topics/estimate', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
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

export const getAllPlans = async (): Promise<StudyPlanOut[]> => {
  const response = await apiClient.get<StudyPlanOut[]>('/api/plans');
  return response.data;
};

export const explainDocumentSubtopic = async (documentId: number, subtopic: string, mode: 'child' | 'average' | 'topper') => {
  const response = await apiClient.post('/api/topics/documents/' + documentId + '/explain', { subtopic, mode });
  return response.data;
};

export const breakdownTopics = async (raw_text: string): Promise<TopicBreakdownResponse> => {
  const response = await apiClient.post<TopicBreakdownResponse>('/api/plans/breakdown', { raw_text });
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

export const recordSessionFocusEvent = async (
  sessionId: number,
  eventType: string,
  strictness: string = 'balanced'
) => {
  const response = await apiClient.post(`/api/sessions/${sessionId}/events`, {
    event_type: eventType,
    strictness,
  });
  return response.data;
};

// Quiz endpoint
export const getQuiz = async (topicId: number, difficulty: string = 'medium'): Promise<QuizOut> => {
  const response = await apiClient.get<QuizOut>(`/api/quizzes/${topicId}`, {
    params: { difficulty },
  });
  return response.data;
};

export const submitQuizAttempt = async (
  quizId: number,
  data: QuizAttemptCreate
): Promise<QuizAttemptOut> => {
  const response = await apiClient.post<QuizAttemptOut>(`/api/quizzes/${quizId}/attempt`, data);
  return response.data;
};

// Doubt endpoint
export const askDoubt = async (data: DoubtRequest): Promise<DoubtAnswer> => {
  const response = await apiClient.post<DoubtAnswer>('/api/doubts', data);
  return response.data;
};

// Session history
export const getSessionHistory = async (): Promise<StudySessionOut[]> => {
  const response = await apiClient.get<StudySessionOut[]>('/api/sessions');
  return response.data;
};

// Topic explanation
export const explainTopic = async (data: TopicExplainRequest): Promise<TopicExplainResponse> => {
  const response = await apiClient.post<TopicExplainResponse>('/api/plans/explain', data);
  return response.data;
};

// Update plan item status
export const updatePlanItemStatus = async (itemId: number, newStatus: 'pending' | 'in_progress' | 'done' | 'skipped'): Promise<PlanItemOut> => {
  const response = await apiClient.patch<PlanItemOut>(`/api/plans/items/${itemId}/status`, { status: newStatus });
  return response.data;
};

// Get active plan
export const getActivePlan = async (): Promise<StudyPlanOut | null> => {
  const response = await apiClient.get<StudyPlanOut | null>('/api/plans/active/current');
  return response.data;
};

// Finalize plan
export const finalizePlan = async (planId: number): Promise<StudyPlanOut> => {
  const response = await apiClient.post<StudyPlanOut>(`/api/plans/${planId}/finalize`);
  return response.data;
};

// Get current learning state
export const getCurrentState = async () => {
  const response = await apiClient.get('/api/plans/state/current');
  return response.data;
};

// Get user topics
export const getUserTopics = async (search?: string): Promise<UserTopicsResponse> => {
  const params = search ? { search } : {};
  const response = await apiClient.get<UserTopicsResponse>('/api/plans/topics', { params });
  return response.data;
};

// Enhanced quiz endpoints
export const getAvailableTopics = async (): Promise<AvailableTopic[]> => {
  const response = await apiClient.get<AvailableTopic[]>('/api/quizzes/topics/available');
  return response.data;
};

export const generateQuiz = async (config: QuizConfig): Promise<QuizOut> => {
  const response = await apiClient.post<QuizOut>('/api/quizzes/generate', config);
  return response.data;
};

export const submitQuiz = async (submission: QuizSubmission): Promise<QuizAttemptOut> => {
  const response = await apiClient.post<QuizAttemptOut>('/api/quizzes/submit', submission);
  return response.data;
};

export const getQuizHistory = async (limit: number = 20): Promise<QuizAttemptOut[]> => {
  const response = await apiClient.get<QuizAttemptOut[]>('/api/quizzes/history', {
    params: { limit },
  });
  return response.data;
};

export const getTopicQuizStats = async (topicId: number): Promise<TopicQuizStats> => {
  const response = await apiClient.get<TopicQuizStats>(`/api/quizzes/topics/${topicId}/stats`);
  return response.data;
};

// Face tracking endpoints
export const recordFaceTrackingEvent = async (attemptId: number, eventType: string, durationSeconds?: number, metadata?: any) => {
  const response = await apiClient.post(`/api/quizzes/attempts/${attemptId}/face-tracking-events`, {
    event_type: eventType,
    duration_seconds: durationSeconds,
    event_metadata: metadata,
  });
  return response.data;
};

export const getFaceTrackingEvents = async (attemptId: number) => {
  const response = await apiClient.get(`/api/quizzes/attempts/${attemptId}/face-tracking-events`);
  return response.data;
};

export const getFaceTrackingSummary = async (attemptId: number) => {
  const response = await apiClient.get(`/api/quizzes/attempts/${attemptId}/face-tracking-summary`);
  return response.data;
};

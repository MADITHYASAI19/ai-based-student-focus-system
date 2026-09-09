// TypeScript interfaces matching backend Pydantic schemas

export interface UserRegister {
  email: string;
  password: string;
  name: string;
  role: string;
  grade_level?: string;
  target_exam?: string;
  parent_id?: number;
}

export interface UserLogin {
  email: string;
  password: string;
}

export interface UserOut {
  id: number;
  email: string;
  name: string;
  role: string;
  grade_level: string | null;
  target_exam: string | null;
  parent_id: number | null;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface LearnedTopic {
  id: number;
  name: string;
  subject: string;
  difficulty: string;
}

export interface Profile {
  user: UserOut;
  profile_score: number;
  focus_score: number | null;
  quiz_average: number | null;
  plan_completion: number;
  completed_sessions: number;
  total_study_minutes: number;
  quiz_attempts: number;
  learned_topics: LearnedTopic[];
}

export interface StudyDocument {
  id: number;
  topic_id: number;
  filename: string;
  content_type: string;
  status: 'processing' | 'completed' | 'failed' | string;
  error_message: string | null;
  concepts: string[];
  difficulty: string | null;
  difficulty_reason: string | null;
  estimated_hours: number | null;
  uploaded_at: string;
  processed_at: string | null;
}

export interface TopicEstimate {
  concepts: string[];
  difficulty: string;
  difficulty_reason: string;
  estimated_hours: number;
}

export interface PlanItemCreate {
  topic_id?: number;
  topic_name?: string;
  scheduled_date?: string | null;
  duration_minutes: number;
  status?: string;
}

export interface StudyPlanCreate {
  exam_deadline: string;
  items?: PlanItemCreate[];
}

export interface PlanItemOut {
  id: number;
  plan_id: number;
  topic_id: number;
  topic_name: string;
  scheduled_date: string | null;
  duration_minutes: number;
  status: string;
}

export interface StudyPlanOut {
  id: number;
  student_id: number;
  exam_deadline: string | null;
  status: string;
  generated_at: string;
  items: PlanItemOut[];
}

export interface StudySessionStart {
  plan_item_id?: number | null;
}

export interface StudySessionOut {
  id: number;
  student_id: number;
  plan_item_id: number | null;
  started_at: string;
  ended_at: string | null;
  focus_score: number | null;
  productivity_score: number | null;
}

export type MonitoringStrictness = 'lenient' | 'balanced' | 'strict';

export interface QuizQuestion {
  id?: number | null;
  question_text: string;
  type: 'mcq' | 'short_answer' | 'coding';
  options?: string[] | null;
  correct_answer: string;
}

export interface QuizOut {
  topic_id: number;
  difficulty: string;
  questions: QuizQuestion[];
}

export interface QuizAttemptCreate {
  answers: Record<string, string>;
}

export interface QuizAttemptOut {
  id: number;
  student_id: number;
  quiz_id: number;
  score: number;
  completed_at: string | null;
}

export interface DoubtRequest {
  question: string;
  subject_id: number;
  topic_id?: number;
}

export interface DoubtAnswer {
  answer_text: string;
  source_chunk_ids: string[];
  confidence: 'high' | 'low';
}

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

export interface PlanItemCreate {
  topic_id: number;
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
}

export interface DoubtAnswer {
  answer_text: string;
  source_chunk_ids: string[];
  confidence: 'high' | 'low';
}

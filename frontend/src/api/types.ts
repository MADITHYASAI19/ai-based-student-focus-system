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
  target_date: string;
  estimated_hours: number;
  priority: 'low' | 'medium' | 'high';
}

export interface StudyPlanCreate {
  student_id: number;
  plan_items: PlanItemCreate[];
}

export interface PlanItemOut {
  id: number;
  study_plan_id: number;
  topic_id: number;
  target_date: string;
  estimated_hours: number;
  priority: string;
  completed: boolean;
  created_at: string;
}

export interface StudyPlanOut {
  id: number;
  student_id: number;
  plan_items: PlanItemOut[];
  created_at: string;
}

export interface StudySessionStart {
  topic_id: number;
}

export interface StudySessionOut {
  id: number;
  student_id: number;
  topic_id: number;
  start_time: string;
  end_time: string | null;
  focus_score: number | null;
  created_at: string;
}

export interface QuizQuestion {
  id: number;
  question_text: string;
  type: string;
  options: string[];
  correct_answer: string;
  explanation: string;
}

export interface QuizOut {
  topic_id: number;
  difficulty: string;
  questions: QuizQuestion[];
}

export interface DoubtRequest {
  question: string;
  subject_id: number;
}

export interface DoubtAnswer {
  answer_text: string;
  source_chunk_ids: string[];
  confidence: 'low' | 'medium' | 'high';
}

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
  structure: Array<{
    name: string;
    subtopics: Array<{ name: string; evidence: string }>;
  }>;
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
  subject_name?: string;
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
  is_active: boolean;
  progress_percentage: number;
  items: PlanItemOut[];
}

export interface StudySessionStart {
  plan_item_id?: number | null;
  document_id?: number | null;
  subtopic?: string | null;
  explanation_mode?: 'child' | 'average' | 'topper';
  duration_minutes?: number | null;
}

export interface StudySessionOut {
  id: number;
  student_id: number;
  plan_item_id: number | null;
  started_at: string;
  ended_at: string | null;
  focus_score: number | null;
  productivity_score: number | null;
  document_id: number | null;
  subtopic: string | null;
  explanation_mode: string;
  duration_minutes: number | null;
}

export interface Explanation {
  document_id: number;
  topic: string;
  subtopic: string;
  mode: string;
  explanation: string;
}

export type MonitoringStrictness = 'lenient' | 'balanced' | 'strict';

export type QuestionType = 'mcq' | 'true_false' | 'fill_blank' | 'short_answer' | 'coding' | 'mixed';
export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'mixed';

export interface QuizQuestion {
  id?: string | null;
  question_text: string;
  type: QuestionType;
  options?: string[] | null;
  correct_answer: string;
  explanation?: string | null;
  points?: number | null;
  difficulty?: string | null;
}

export interface QuizOut {
  quiz_cache_key: string;
  topic_id: number;
  topic_name: string;
  difficulty: string;
  question_types: string[];
  questions: QuizQuestion[];
  total_points: number;
  time_limit_minutes?: number | null;
  fullscreen_required?: boolean;
  pdf_source_mode?: 'topic_knowledge' | 'pdf_only' | 'topic_pdf';
}

export interface QuizConfig {
  topic_id: number;
  difficulty: DifficultyLevel;
  question_types: QuestionType[];
  n_questions: number;
  time_limit_minutes?: number | null;
  fullscreen_required?: boolean;
  pdf_source_mode?: 'topic_knowledge' | 'pdf_only' | 'topic_pdf';
}

export interface QuestionAnswer {
  question_id: string;
  answer: string;
}

export interface QuizSubmission {
  quiz_cache_key: string;
  topic_id: number;
  difficulty: string;
  question_types: string[];
  n_questions: number;
  time_limit_minutes?: number | null;
  start_time?: string | null;
  answers: QuestionAnswer[];
}

export interface QuestionResult {
  question_id: string;
  question_text: string;
  question_type: string;
  student_answer: string;
  correct_answer: string;
  is_correct: boolean;
  points_awarded: number;
  points_possible: number;
  explanation?: string | null;
}

export interface QuizAttemptOut {
  id: number;
  student_id: number;
  quiz_id: number;
  topic_id?: number | null;
  difficulty?: string | null;
  question_type?: string | null;
  score: number;
  total_points?: number | null;
  correct_count?: number | null;
  incorrect_count?: number | null;
  unanswered_count?: number | null;
  question_results?: QuestionResult[] | null;
  completed_at?: string | null;
  start_time?: string | null;
  time_limit_minutes?: number | null;
}

// Legacy (kept for backward compat)
export interface QuizAttemptCreate {
  answers: Record<string, string>;
}

export interface TopicQuizStats {
  topic_id: number;
  topic_name: string;
  attempt_count: number;
  average_score: number;
  best_score: number;
  total_questions_attempted: number;
  total_correct: number;
}

export interface AvailableTopic {
  id: number;
  name: string;
  subject_name: string;
  subject_id: number;
  difficulty: string;
}

export interface UserTopic {
  id: number;
  name: string;
  subject: string;
  subject_id: number;
  difficulty: string;
  estimated_hours: number;
  in_plan: boolean;
  status: string | null;
  plan_id: number | null;
  item_id: number | null;
}

export interface UserTopicsResponse {
  topics: UserTopic[];
}

export interface UserSubject {
  id: number;
  name: string;
  total_topics: number;
  completed_topics: number;
  in_progress_topics: number;
  planned_topics: number;
  progress_percentage: number;
}

export interface UserSubjectsResponse {
  subjects: UserSubject[];
}

export interface SubjectTopic {
  id: number;
  name: string;
  subject_id: number;
  difficulty: string;
  estimated_hours: number;
  status: string | null;
  plan_id: number | null;
  item_id: number | null;
}

export interface SubjectTopicsResponse {
  topics: SubjectTopic[];
}


export interface DoubtRequest {
  question: string;
  subject_id?: number;
  topic_id?: number;
  source_mode?: 'pdf+ai' | 'pdf_only' | 'general_ai';
  conversation_history?: Array<{ role: string; content: string }>;
}

export interface AnswerSection {
  type: 'pdf' | 'ai' | 'mixed';
  content: string;
  sources?: Array<{ type: string; chunks?: string[] }>;
}

export interface DoubtAnswer {
  answer_text: string;
  source_chunk_ids: string[];
  confidence: 'high' | 'low';
  sections?: AnswerSection[];
  source_type?: 'pdf' | 'ai' | 'mixed' | 'none';
}

export interface TopicBreakdownRequest {
  raw_text: string;
}

export interface TopicConcept {
  topic_name: string;
  duration_minutes: number;
}

export interface TopicBreakdownResponse {
  topics: TopicConcept[];
  subject_name?: string;
}

export interface ItemStatusUpdate {
  status: 'pending' | 'done' | 'skipped';
}

export interface TopicExplainRequest {
  topic_name: string;
  mode: 'child' | 'average' | 'topper';
}

export interface TopicExplainResponse {
  topic_name: string;
  explanation: string;
}

export interface UserCurrentState {
  user_id: number;
  current_plan_id: number | null;
  current_session_id: number | null;
  active_plan: StudyPlanOut | null;
  current_session: StudySessionOut | null;
}

export interface StoredExplanation {
  topic_id: number;
  topic_name: string;
  explanation_mode: string;
  content: string;
  generated_at: string;
}

export interface StoredExplanationsResponse {
  explanations: StoredExplanation[];
}

export type NotificationType = 'upcoming_study' | 'study_starting' | 'study_completed' | 'study_overdue' | 'quiz_reminder' | 'celebration';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  topicName?: string;
  scheduledTime?: string;
  isRead: boolean;
  createdAt: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

"""
Quiz schemas — single source of truth shared by the quiz router, quiz service,
and ai_service.generation.quiz_gen.  Must NOT import FastAPI or SQLAlchemy.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Literal, Optional, Any
from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------------------------------------------------------------------
# Question types
# ---------------------------------------------------------------------------
QuestionType = Literal["mcq", "true_false", "fill_blank", "short_answer", "coding"]
DifficultyLevel = Literal["easy", "medium", "hard", "mixed"]

# Points per question type (server-side truth)
QUESTION_POINTS: dict[str, float] = {
    "mcq": 1.0,
    "true_false": 1.0,
    "fill_blank": 1.0,
    "short_answer": 1.0,
    "coding": 3.0,
}


class QuizQuestion(BaseModel):
    """Schema for a single quiz question (shared with ai_service)."""
    id: Optional[str] = None          # string id like "q1", "q2"
    question_text: str
    type: QuestionType
    options: Optional[list[str]] = None
    correct_answer: str
    explanation: Optional[str] = None
    points: Optional[float] = None    # overrides QUESTION_POINTS if set
    difficulty: Optional[str] = None  # per-question difficulty metadata


# ---------------------------------------------------------------------------
# Quiz configuration (what the student selects)
# ---------------------------------------------------------------------------
class QuizConfig(BaseModel):
    """Quiz generation request from the frontend."""
    topic_id: int
    difficulty: DifficultyLevel = "medium"
    question_types: list[QuestionType] = Field(default_factory=lambda: ["mcq"])
    n_questions: int = Field(default=5, ge=1, le=30)
    time_limit_minutes: Optional[int] = Field(default=None, ge=1, le=120)
    face_tracking_enabled: bool = Field(default=False)  # Optional face tracking during quiz
    fullscreen_required: bool = Field(default=False)  # Require fullscreen mode for this quiz
    pdf_source_mode: Optional[Literal["topic_knowledge", "pdf_only", "topic_pdf"]] = Field(default="topic_knowledge")  # Quiz content source

    @field_validator("question_types")
    @classmethod
    def at_least_one_type(cls, v: list) -> list:
        if not v:
            raise ValueError("At least one question type must be selected")
        return v


# ---------------------------------------------------------------------------
# Quiz output (returned to frontend after generation)
# ---------------------------------------------------------------------------
class QuizOut(BaseModel):
    """Full quiz payload returned by /api/quizzes/generate."""
    quiz_cache_key: str                # opaque key for submission
    topic_id: int
    topic_name: str
    difficulty: str
    question_types: list[str]
    questions: list[QuizQuestion]
    total_points: float
    time_limit_minutes: Optional[int] = None
    face_tracking_enabled: bool = False
    fullscreen_required: bool = False
    pdf_source_mode: Optional[str] = None  # "topic_knowledge", "pdf_only", or "topic_pdf"


# ---------------------------------------------------------------------------
# Submission
# ---------------------------------------------------------------------------
class QuestionAnswer(BaseModel):
    """Student's answer for one question."""
    question_id: str                   # matches QuizQuestion.id
    answer: str                        # text of chosen option / typed answer


class QuizSubmission(BaseModel):
    """Rich quiz submission payload."""
    quiz_cache_key: str
    topic_id: int
    difficulty: str
    question_types: list[str]
    n_questions: int
    time_limit_minutes: Optional[int] = None
    start_time: Optional[str] = None   # ISO 8601 string from frontend
    answers: list[QuestionAnswer]


# ---------------------------------------------------------------------------
# Per-question result
# ---------------------------------------------------------------------------
class QuestionResult(BaseModel):
    """Server-computed result for a single question."""
    question_id: str
    question_text: str
    question_type: str
    student_answer: str
    correct_answer: str
    is_correct: bool
    points_awarded: float
    points_possible: float
    explanation: Optional[str] = None


# ---------------------------------------------------------------------------
# Attempt result
# ---------------------------------------------------------------------------
class QuizAttemptOut(BaseModel):
    """Schema for returning quiz attempt grading result."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    quiz_id: int                       # == topic_id for backward compat
    topic_id: Optional[int] = None
    difficulty: Optional[str] = None
    question_type: Optional[str] = None
    score: float                       # percentage 0-100
    total_points: Optional[float] = None
    correct_count: Optional[int] = None
    incorrect_count: Optional[int] = None
    unanswered_count: Optional[int] = None
    question_results: Optional[list[dict[str, Any]]] = None
    completed_at: Optional[str] = None
    start_time: Optional[str] = None
    time_limit_minutes: Optional[int] = None


# ---------------------------------------------------------------------------
# Legacy schemas — kept for backward compat with existing tests
# ---------------------------------------------------------------------------
class QuizAttemptCreate(BaseModel):
    """Legacy: submit answers as a dict (question index → answer string)."""
    answers: dict[str, str]


# ---------------------------------------------------------------------------
# Topic stats
# ---------------------------------------------------------------------------
class TopicQuizStats(BaseModel):
    """Per-topic quiz performance summary."""
    topic_id: int
    topic_name: str
    attempt_count: int
    average_score: float
    best_score: float
    total_questions_attempted: int
    total_correct: int


# ---------------------------------------------------------------------------
# Available topic (for quiz topic picker)
# ---------------------------------------------------------------------------
class AvailableTopic(BaseModel):
    """A topic the student can be quizzed on."""
    id: int
    name: str
    subject_name: str
    difficulty: str


# ---------------------------------------------------------------------------
# Normalize fill-blank answers
# ---------------------------------------------------------------------------
_SPACE_RE = re.compile(r"\s+")
_PUNCT_RE = re.compile(r"[^\w\s()\[\]{}+\-*/=<>!?%^&|~.,]")


def normalize_fill_blank(text: str) -> str:
    """Normalize a fill-in-the-blank answer for lenient comparison."""
    t = text.lower().strip()
    t = _PUNCT_RE.sub("", t)
    t = _SPACE_RE.sub(" ", t).strip()
    # Normalize common complexity notations
    t = t.replace("o(", "").replace(")", "").strip()  # O(log n) → log n
    return t

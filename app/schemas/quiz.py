from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict


class QuizQuestion(BaseModel):
    """Schema for a quiz question."""
    id: Optional[int] = None
    question_text: str
    type: Literal["mcq", "short_answer", "coding"]
    options: Optional[list[str]] = None
    correct_answer: str


class QuizOut(BaseModel):
    """Schema for quiz output."""
    topic_id: int
    difficulty: str
    questions: list[QuizQuestion]


class QuizAttemptCreate(BaseModel):
    """Schema for submitting student answers for a quiz attempt."""
    answers: dict[str, str]  # question index or id as str -> student answer


class QuizAttemptOut(BaseModel):
    """Schema for returning quiz attempt grading result."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    quiz_id: int
    score: float
    completed_at: str | None = None

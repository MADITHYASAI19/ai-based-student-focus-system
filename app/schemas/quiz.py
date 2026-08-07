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

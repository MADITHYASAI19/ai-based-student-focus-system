from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class UserRegister(BaseModel):
    """Schema for user registration."""
    email: str
    password: str
    name: str
    role: Optional[str] = "student"


class UserLogin(BaseModel):
    """Schema for user login (JSON body)."""
    email: str
    password: str


class UserOut(BaseModel):
    """Schema for user output (no password)."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str
    role: str
    grade_level: Optional[str] = None
    target_exam: Optional[str] = None
    parent_id: Optional[int] = None
    created_at: datetime


class Token(BaseModel):
    """Schema for token response."""
    access_token: str
    token_type: str = "bearer"


class LearnedTopicOut(BaseModel):
    """A topic the student has completed or studied in a finished session."""
    id: int
    name: str
    subject: str
    difficulty: str


class ProfileOut(BaseModel):
    """Aggregated student profile and learning progress."""
    user: UserOut
    profile_score: float
    focus_score: float | None
    quiz_average: float | None
    plan_completion: float
    completed_sessions: int
    total_study_minutes: int
    quiz_attempts: int
    learned_topics: list[LearnedTopicOut]

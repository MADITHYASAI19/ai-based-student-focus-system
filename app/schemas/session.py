from datetime import datetime

from pydantic import BaseModel, ConfigDict


class StudySessionStart(BaseModel):
    """Request payload to start a study session."""

    plan_item_id: int | None = None
    document_id: int | None = None
    subtopic: str | None = None
    explanation_mode: str = "average"
    duration_minutes: int | None = None


class StudySessionOut(BaseModel):
    """Response schema for a study session."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    plan_item_id: int | None = None
    document_id: int | None = None
    subtopic: str | None = None
    explanation_mode: str = "average"
    duration_minutes: int | None = None
    started_at: datetime
    ended_at: datetime | None = None
    focus_score: float | None = None
    productivity_score: float | None = None


class FocusEventCreate(BaseModel):
    event_type: str
    strictness: str = "balanced"

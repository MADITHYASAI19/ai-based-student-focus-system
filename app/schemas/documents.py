from datetime import datetime
from pydantic import BaseModel


class StudyDocumentOut(BaseModel):
    id: int
    topic_id: int
    filename: str
    content_type: str
    status: str
    error_message: str | None = None
    concepts: list[str]
    difficulty: str | None = None
    difficulty_reason: str | None = None
    estimated_hours: float | None = None
    uploaded_at: datetime
    processed_at: datetime | None = None

    class Config:
        from_attributes = True


class TopicEstimateOut(BaseModel):
    concepts: list[str]
    difficulty: str
    difficulty_reason: str
    estimated_hours: float

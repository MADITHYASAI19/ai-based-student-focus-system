from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PlanItemCreate(BaseModel):
    """A plan item to create with its parent study plan."""

    topic_id: int | None = None
    topic_name: str | None = None
    scheduled_date: datetime | None = None
    duration_minutes: int
    status: str = "pending"


class PlanItemOut(BaseModel):
    """Plan-item response schema compatible with the ORM model."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    plan_id: int
    topic_id: int
    topic_name: str
    scheduled_date: datetime | None = None
    duration_minutes: int
    status: str


class StudyPlanCreate(BaseModel):
    """Request schema for the authenticated user's new study plan."""

    model_config = ConfigDict(extra="forbid")

    exam_deadline: datetime
    items: list[PlanItemCreate] = Field(default_factory=list)
    subject_name: str | None = None  # Optional subject name for organizing topics


class StudyPlanOut(BaseModel):
    """Study-plan response schema compatible with the ORM model."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    exam_deadline: datetime | None = None
    status: str
    generated_at: datetime
    is_active: bool = False
    progress_percentage: int = 0
    items: list[PlanItemOut] = Field(validation_alias="plan_items")


class TopicBreakdownRequest(BaseModel):
    raw_text: str


class TopicConcept(BaseModel):
    topic_name: str
    duration_minutes: int


class TopicBreakdownResponse(BaseModel):
    topics: list[TopicConcept]
    subject_name: str | None = None


class ItemStatusUpdate(BaseModel):
    status: str  # pending | in_progress | done | skipped


class TopicExplainRequest(BaseModel):
    topic_name: str
    mode: str = "average"  # child | average | topper


class TopicExplainResponse(BaseModel):
    topic_name: str
    explanation: str


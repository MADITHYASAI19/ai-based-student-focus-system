from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PlanItemCreate(BaseModel):
    """A plan item to create with its parent study plan."""

    topic_id: int
    scheduled_date: datetime | None = None
    duration_minutes: int
    status: str = "pending"


class PlanItemOut(BaseModel):
    """Plan-item response schema compatible with the ORM model."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    plan_id: int
    topic_id: int
    scheduled_date: datetime | None = None
    duration_minutes: int
    status: str


class StudyPlanCreate(BaseModel):
    """Request schema for the authenticated user's new study plan."""

    model_config = ConfigDict(extra="forbid")

    exam_deadline: datetime
    items: list[PlanItemCreate] = Field(default_factory=list)


class StudyPlanOut(BaseModel):
    """Study-plan response schema compatible with the ORM model."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    exam_deadline: datetime | None = None
    status: str
    generated_at: datetime
    items: list[PlanItemOut] = Field(validation_alias="plan_items")

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.models import PlanItem, StudyPlan
from app.schemas.plan import PlanItemCreate


def create_plan(
    db: Session,
    student_id: int,
    exam_deadline: datetime,
    items: list[PlanItemCreate],
) -> StudyPlan:
    """Create a study plan and its items atomically for one student."""
    db_plan = StudyPlan(
        student_id=student_id,
        exam_deadline=exam_deadline,
        status="pending",
    )
    db.add(db_plan)
    db.flush()

    for item in items:
        db.add(
            PlanItem(
                plan_id=db_plan.id,
                topic_id=item.topic_id,
                scheduled_date=item.scheduled_date,
                duration_minutes=item.duration_minutes,
                status=item.status,
            )
        )

    db.commit()
    db.refresh(db_plan)
    return db_plan


def get_plan(db: Session, student_id: int) -> StudyPlan | None:
    """Return the study plan belonging to the supplied student ID, if any."""
    return db.query(StudyPlan).filter(StudyPlan.student_id == student_id).first()

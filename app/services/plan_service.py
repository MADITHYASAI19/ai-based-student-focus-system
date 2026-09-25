from datetime import datetime

from sqlalchemy.orm import Session

from app.models.models import PlanItem, StudyPlan, Subject, Topic
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

    personal_subject = db.query(Subject).filter(Subject.name == "My Topics").first()
    if not personal_subject:
        personal_subject = Subject(name="My Topics")
        db.add(personal_subject)
        db.flush()

    for item in items:
        topic_id = item.topic_id
        if item.topic_name and item.topic_name.strip():
            topic = (
                db.query(Topic)
                .filter(Topic.subject_id == personal_subject.id, Topic.name == item.topic_name.strip())
                .first()
            )
            if not topic:
                topic = Topic(
                    subject_id=personal_subject.id,
                    name=item.topic_name.strip(),
                    difficulty="medium",
                    estimated_hours=max(1, round(item.duration_minutes / 60)),
                )
                db.add(topic)
                db.flush()
            topic_id = topic.id
        if topic_id is None:
            raise ValueError("Each plan item needs a topic name")
        db.add(
            PlanItem(
                plan_id=db_plan.id,
                topic_id=topic_id,
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


def get_all_plans_for_student(db: Session, student_id: int) -> list[StudyPlan]:
    """Return all study plans for the given student, newest first."""
    return (
        db.query(StudyPlan)
        .filter(StudyPlan.student_id == student_id)
        .order_by(StudyPlan.generated_at.desc())
        .all()
    )


def update_item_status(db: Session, item_id: int, student_id: int, new_status: str) -> PlanItem | None:
    """Update the status of a plan item. Returns None if not found / not owned."""
    from sqlalchemy.orm import joinedload
    item = (
        db.query(PlanItem)
        .join(PlanItem.study_plan)
        .filter(PlanItem.id == item_id, StudyPlan.student_id == student_id)
        .first()
    )
    if not item:
        return None
    item.status = new_status
    db.commit()
    db.refresh(item)
    return item


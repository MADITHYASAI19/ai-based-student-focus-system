from datetime import datetime
import unicodedata

from sqlalchemy.orm import Session

from app.models.models import PlanItem, StudyPlan, Subject, Topic, User
from app.schemas.plan import PlanItemCreate


def normalize_topic_name(name: str) -> str:
    """Normalize a topic name for duplicate detection.
    
    - Convert to lowercase
    - Remove extra whitespace
    - Remove accents (optional, for better matching)
    """
    # Remove extra whitespace
    normalized = " ".join(name.strip().split())
    # Convert to lowercase
    normalized = normalized.lower()
    # Optional: remove accents (uncomment if needed)
    # normalized = unicodedata.normalize('NFKD', normalized)
    # normalized = ''.join(c for c in normalized if not unicodedata.combining(c))
    return normalized


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
            # Use normalized name for duplicate detection
            normalized_name = normalize_topic_name(item.topic_name.strip())
            
            # Check for existing topic with normalized name comparison
            topic = (
                db.query(Topic)
                .filter(Topic.subject_id == personal_subject.id)
                .first()
            )
            
            # Find if any existing topic matches (case-insensitive, whitespace-insensitive)
            if topic:
                existing_topics = (
                    db.query(Topic)
                    .filter(Topic.subject_id == personal_subject.id)
                    .all()
                )
                matching_topic = None
                for existing in existing_topics:
                    if normalize_topic_name(existing.name) == normalized_name:
                        matching_topic = existing
                        break
                topic = matching_topic
            
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
    
    # Update plan progress after item status change
    update_plan_progress(db, item.plan_id)
    
    return item


def finalize_plan(db: Session, plan_id: int, student_id: int) -> StudyPlan | None:
    """Finalize a study plan as the active plan for the student."""
    plan = (
        db.query(StudyPlan)
        .filter(StudyPlan.id == plan_id, StudyPlan.student_id == student_id)
        .first()
    )
    if not plan:
        return None
    
    # Deactivate all other plans for this student
    db.query(StudyPlan).filter(
        StudyPlan.student_id == student_id,
        StudyPlan.id != plan_id
    ).update({"is_active": False})
    
    # Activate this plan
    plan.is_active = True
    plan.status = "in_progress"
    
    # Update user's current plan
    user = db.query(User).filter(User.id == student_id).first()
    if user:
        user.current_plan_id = plan_id
    
    # Calculate initial progress
    update_plan_progress(db, plan_id)
    
    db.commit()
    db.refresh(plan)
    return plan


def update_plan_progress(db: Session, plan_id: int) -> None:
    """Update the progress percentage of a study plan based on completed items."""
    plan = db.query(StudyPlan).filter(StudyPlan.id == plan_id).first()
    if not plan:
        return
    
    total_items = db.query(PlanItem).filter(PlanItem.plan_id == plan_id).count()
    if total_items == 0:
        plan.progress_percentage = 0
    else:
        done_items = db.query(PlanItem).filter(
            PlanItem.plan_id == plan_id,
            PlanItem.status == "done"
        ).count()
        plan.progress_percentage = int((done_items / total_items) * 100)
    
    db.commit()


def get_active_plan(db: Session, student_id: int) -> StudyPlan | None:
    """Get the currently active study plan for a student."""
    return (
        db.query(StudyPlan)
        .filter(StudyPlan.student_id == student_id, StudyPlan.is_active == True)
        .first()
    )


def get_user_current_state(db: Session, student_id: int) -> dict:
    """Get the current learning state for a user including active plan and session."""
    user = db.query(User).filter(User.id == student_id).first()
    if not user:
        return {}
    
    active_plan = get_active_plan(db, student_id)
    current_session = None
    
    if user.current_session_id:
        from app.models.models import StudySession
        current_session = db.query(StudySession).filter(
            StudySession.id == user.current_session_id
        ).first()
    
    return {
        "user_id": user.id,
        "current_plan_id": user.current_plan_id,
        "current_session_id": user.current_session_id,
        "active_plan": active_plan,
        "current_session": current_session,
    }


def get_user_topics(db: Session, student_id: int, search_query: str | None = None) -> list[dict]:
    """Get all topics associated with a user (via their study plans or personal subjects).
    
    Args:
        db: Database session
        student_id: User ID
        search_query: Optional search string to filter topics by name
    
    Returns:
        List of topic dictionaries with id, name, subject, difficulty, estimated_hours
    """
    from sqlalchemy.orm import joinedload
    
    # Get all topics from "My Topics" subject (personal topics)
    personal_subject = db.query(Subject).filter(Subject.name == "My Topics").first()
    
    if not personal_subject:
        return []
    
    # Get all topics from personal subject
    query = db.query(Topic).filter(Topic.subject_id == personal_subject.id)
    
    # Apply search filter if provided
    if search_query and search_query.strip():
        search_normalized = normalize_topic_name(search_query)
        # Filter topics where normalized name contains search query
        topics = query.all()
        filtered = []
        for topic in topics:
            if search_normalized in normalize_topic_name(topic.name):
                filtered.append(topic)
        topics = filtered
    else:
        topics = query.all()
    
    # Get topic status from plan items if they exist in any plan
    result = []
    for topic in topics:
        # Check if this topic is in any of the user's plans
        plan_item = (
            db.query(PlanItem)
            .join(StudyPlan)
            .filter(
                PlanItem.topic_id == topic.id,
                StudyPlan.student_id == student_id
            )
            .first()
        )
        
        topic_dict = {
            "id": topic.id,
            "name": topic.name,
            "subject": personal_subject.name,
            "difficulty": topic.difficulty,
            "estimated_hours": topic.estimated_hours,
            "in_plan": plan_item is not None,
            "status": plan_item.status if plan_item else None,
            "plan_id": plan_item.plan_id if plan_item else None,
            "item_id": plan_item.id if plan_item else None,
        }
        result.append(topic_dict)
    
    return result


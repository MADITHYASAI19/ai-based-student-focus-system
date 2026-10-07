from datetime import datetime
import unicodedata

from sqlalchemy.orm import Session
from sqlalchemy import case

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
    subject_name: str | None = None,
) -> StudyPlan:
    """Create a study plan and its items atomically for one student.
    
    Args:
        db: Database session
        student_id: User ID
        exam_deadline: Plan deadline
        items: List of plan items (topics)
        subject_name: Optional subject name (if not provided, uses "My Topics")
    """
    db_plan = StudyPlan(
        student_id=student_id,
        exam_deadline=exam_deadline,
        status="pending",
    )
    db.add(db_plan)
    db.flush()

    # Use provided subject name or default to "My Topics"
    subject_name = subject_name or "My Topics"
    
    # Get or create the subject
    subject = db.query(Subject).filter(Subject.name == subject_name).first()
    if not subject:
        subject = Subject(name=subject_name)
        db.add(subject)
        db.flush()

    for item in items:
        topic_id = item.topic_id
        if item.topic_name and item.topic_name.strip():
            # Use normalized name for duplicate detection
            normalized_name = normalize_topic_name(item.topic_name.strip())
            
            # Check for existing topic in this subject with normalized name comparison
            existing_topics = (
                db.query(Topic)
                .filter(Topic.subject_id == subject.id)
                .all()
            )
            matching_topic = None
            for existing in existing_topics:
                if normalize_topic_name(existing.name) == normalized_name:
                    matching_topic = existing
                    break
            
            if not matching_topic:
                topic = Topic(
                    subject_id=subject.id,
                    name=item.topic_name.strip(),
                    difficulty="medium",
                    estimated_hours=max(1, round(item.duration_minutes / 60)),
                )
                db.add(topic)
                db.flush()
                topic_id = topic.id
            else:
                topic_id = matching_topic.id
                
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
    
    # Get all topics from all subjects that the user has in their plans
    # Join through plan_items → study_plans → topics → subjects
    query = (
        db.query(Topic, Subject)
        .join(PlanItem, PlanItem.topic_id == Topic.id)
        .join(StudyPlan, StudyPlan.id == PlanItem.plan_id)
        .join(Subject, Subject.id == Topic.subject_id)
        .filter(StudyPlan.student_id == student_id)
        .distinct()
    )
    
    # Apply search filter if provided
    if search_query and search_query.strip():
        search_normalized = normalize_topic_name(search_query)
        # Filter topics where normalized name contains search query
        all_results = query.all()
        filtered = []
        for topic, subject in all_results:
            if search_normalized in normalize_topic_name(topic.name):
                filtered.append((topic, subject))
        results = filtered
    else:
        results = query.all()
    
    # Get topic status from plan items
    topic_status_map = {}
    plan_items = (
        db.query(PlanItem)
        .join(StudyPlan)
        .filter(StudyPlan.student_id == student_id)
        .all()
    )
    for item in plan_items:
        topic_status_map[item.topic_id] = {
            "status": item.status,
            "plan_id": item.plan_id,
            "item_id": item.id,
        }
    
    # Build result
    result = []
    for topic, subject in results:
        status_info = topic_status_map.get(topic.id, {})
        topic_dict = {
            "id": topic.id,
            "name": topic.name,
            "subject": subject.name,
            "subject_id": subject.id,
            "difficulty": topic.difficulty,
            "estimated_hours": topic.estimated_hours,
            "in_plan": True,
            "status": status_info.get("status"),
            "plan_id": status_info.get("plan_id"),
            "item_id": status_info.get("item_id"),
        }
        result.append(topic_dict)
    
    return result


def get_user_subjects(db: Session, student_id: int, search_query: str | None = None) -> list[dict]:
    """Get all subjects associated with a user with topic counts and progress.
    
    Args:
        db: Database session
        student_id: User ID
        search_query: Optional search string to filter subjects by name
    
    Returns:
        List of subject dictionaries with id, name, topic counts, and progress
    """
    from sqlalchemy import func
    
    # Get all subjects that the user has topics for (via their plans)
    # Join through plan_items → study_plans → topics → subjects
    query = (
        db.query(
            Subject.id,
            Subject.name,
            func.count(Topic.id).label('total_topics'),
            func.sum(case((PlanItem.status == 'done', 1), else_=0)).label('completed_topics'),
            func.sum(case((PlanItem.status == 'in_progress', 1), else_=0)).label('in_progress_topics'),
            func.sum(case((PlanItem.status == 'pending', 1), else_=0)).label('planned_topics'),
        )
        .join(Topic, Topic.subject_id == Subject.id)
        .join(PlanItem, PlanItem.topic_id == Topic.id)
        .join(StudyPlan, StudyPlan.id == PlanItem.plan_id)
        .filter(StudyPlan.student_id == student_id)
        .group_by(Subject.id, Subject.name)
        .distinct()
    )
    
    # Apply search filter if provided
    if search_query and search_query.strip():
        search_normalized = normalize_topic_name(search_query)
        # Filter subjects where normalized name contains search query
        all_results = query.all()
        filtered = []
        for subject in all_results:
            if search_normalized in normalize_topic_name(subject.name):
                filtered.append(subject)
        results = filtered
    else:
        results = query.all()
    
    # Build result
    result = []
    for subject in results:
        total = subject.total_topics or 0
        completed = subject.completed_topics or 0
        in_progress = subject.in_progress_topics or 0
        planned = subject.planned_topics or 0
        progress = int((completed / total) * 100) if total > 0 else 0
        
        subject_dict = {
            "id": subject.id,
            "name": subject.name,
            "total_topics": total,
            "completed_topics": completed,
            "in_progress_topics": in_progress,
            "planned_topics": planned,
            "progress_percentage": progress,
        }
        result.append(subject_dict)
    
    return result


def get_topics_for_subject(db: Session, student_id: int, subject_id: int) -> list[dict]:
    """Get all topics for a specific subject that the user has in their plans.
    
    Args:
        db: Database session
        student_id: User ID
        subject_id: Subject ID
    
    Returns:
        List of topic dictionaries with id, name, status, etc.
    """
    # Get all topics from the specific subject that are in the user's plans
    # No status filter - completed topics should still appear
    query = (
        db.query(Topic)
        .join(PlanItem, PlanItem.topic_id == Topic.id)
        .join(StudyPlan, StudyPlan.id == PlanItem.plan_id)
        .filter(
            StudyPlan.student_id == student_id,
            Topic.subject_id == subject_id
        )
        .distinct()
    )
    
    topics = query.all()
    
    # Get topic status from plan items
    topic_status_map = {}
    plan_items = (
        db.query(PlanItem)
        .join(StudyPlan)
        .filter(
            StudyPlan.student_id == student_id,
            PlanItem.topic_id.in_([t.id for t in topics])
        )
        .all()
    )
    for item in plan_items:
        topic_status_map[item.topic_id] = {
            "status": item.status,
            "plan_id": item.plan_id,
            "item_id": item.id,
        }
    
    # Build result
    result = []
    for topic in topics:
        status_info = topic_status_map.get(topic.id, {})
        topic_dict = {
            "id": topic.id,
            "name": topic.name,
            "subject_id": topic.subject_id,
            "difficulty": topic.difficulty,
            "estimated_hours": topic.estimated_hours,
            "status": status_info.get("status"),
            "plan_id": status_info.get("plan_id"),
            "item_id": status_info.get("item_id"),
        }
        result.append(topic_dict)
    
    return result


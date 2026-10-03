from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.models import FocusEvent, FocusMetric, StudySession, User


def start_session(
    db: Session,
    student_id: int,
    plan_item_id: int | None = None,
    document_id: int | None = None,
    subtopic: str | None = None,
    explanation_mode: str = "average",
    duration_minutes: int | None = None,
) -> StudySession:
    """Start a new study session for a student."""
    session = StudySession(
        student_id=student_id,
        plan_item_id=plan_item_id,
        document_id=document_id,
        subtopic=subtopic,
        explanation_mode=explanation_mode,
        duration_minutes=duration_minutes,
        started_at=datetime.utcnow(),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    
    # Update user's current session
    user = db.query(User).filter(User.id == student_id).first()
    if user:
        user.current_session_id = session.id
        db.commit()
    
    return session


def get_session(db: Session, session_id: int) -> StudySession | None:
    """Retrieve a study session by ID."""
    return db.query(StudySession).filter(StudySession.id == session_id).first()


def calculate_focus_score(session: StudySession) -> float:
    """Calculate focus score based on focus events recorded during session."""
    base_score = 100.0
    penalties = {
        "phone_detected": 15.0,
        "away": 20.0,
        "sleepy": 10.0,
        "tab_switch": 5.0,
        "fullscreen_exit": 5.0,
    }
    total_penalty = sum(
        penalties.get(event.event_type, 5.0) for event in session.focus_events
    )
    return max(0.0, base_score - total_penalty)


def calculate_focus_score_from_metrics(session: StudySession, db: Session) -> Optional[float]:
    """Calculate focus score from FocusMetric data if available."""
    metrics = db.query(FocusMetric).filter(
        FocusMetric.session_id == session.id
    ).all()
    
    if not metrics:
        return None
    
    # Calculate average focus score from metrics
    total_focus_score = sum(m.focus_score for m in metrics)
    avg_focus_score = total_focus_score / len(metrics)
    
    return avg_focus_score


def end_session(db: Session, session: StudySession) -> StudySession:
    """End a study session and compute focus score."""
    session.ended_at = datetime.utcnow()
    
    # Try to get focus score from metrics first, fall back to event-based calculation
    metrics_score = calculate_focus_score_from_metrics(session, db)
    if metrics_score is not None:
        session.focus_score = metrics_score
        # Get average productivity score from metrics
        metrics = db.query(FocusMetric).filter(
            FocusMetric.session_id == session.id
        ).all()
        if metrics:
            total_productivity = sum(m.productivity_score for m in metrics)
            session.productivity_score = total_productivity / len(metrics)
    else:
        score = calculate_focus_score(session)
        session.focus_score = score
        if session.productivity_score is None:
            session.productivity_score = score

    # Clear user's current session
    user = db.query(User).filter(User.id == session.student_id).first()
    if user and user.current_session_id == session.id:
        user.current_session_id = None

    db.commit()
    db.refresh(session)
    return session

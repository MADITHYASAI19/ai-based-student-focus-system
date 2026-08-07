from datetime import datetime

from sqlalchemy.orm import Session

from app.models.models import FocusEvent, StudySession


def start_session(
    db: Session,
    student_id: int,
    plan_item_id: int | None = None,
) -> StudySession:
    """Start a new study session for a student."""
    session = StudySession(
        student_id=student_id,
        plan_item_id=plan_item_id,
        started_at=datetime.utcnow(),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
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
    }
    total_penalty = sum(
        penalties.get(event.event_type, 5.0) for event in session.focus_events
    )
    return max(0.0, base_score - total_penalty)


def end_session(db: Session, session: StudySession) -> StudySession:
    """End a study session and compute focus score."""
    session.ended_at = datetime.utcnow()
    score = calculate_focus_score(session)
    session.focus_score = score
    if session.productivity_score is None:
        session.productivity_score = score

    db.commit()
    db.refresh(session)
    return session

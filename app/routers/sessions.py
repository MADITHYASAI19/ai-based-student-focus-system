from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import get_current_user
from app.models.models import User
from app.schemas.session import FocusEventCreate, StudySessionOut, StudySessionStart
from app.models.models import FocusEvent
from app.services.session_service import end_session, get_session, start_session

router = APIRouter()


@router.post("/start", response_model=StudySessionOut, status_code=status.HTTP_201_CREATED)
def start_study_session(
    session_data: StudySessionStart | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start a study session for the authenticated user."""
    plan_item_id = session_data.plan_item_id if session_data else None
    return start_session(
        db=db,
        student_id=current_user.id,
        plan_item_id=plan_item_id,
        document_id=session_data.document_id if session_data else None,
        subtopic=session_data.subtopic if session_data else None,
        explanation_mode=session_data.explanation_mode if session_data else "average",
        duration_minutes=session_data.duration_minutes if session_data else None,
    )


@router.patch("/{session_id}/end", response_model=StudySessionOut)
def end_study_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """End a study session and return it with focus_score populated."""
    session = get_session(db=db, session_id=session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study session not found",
        )
    if session.student_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to end this study session",
        )
    return end_session(db=db, session=session)


@router.post("/{session_id}/events", status_code=status.HTTP_201_CREATED)
def record_focus_event(
    session_id: int,
    event_data: FocusEventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record a derived browser monitoring event; raw camera data is never accepted."""
    session = get_session(db=db, session_id=session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Study session not found")
    if session.student_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to record this event")
    allowed_events = {"phone_detected", "away", "sleepy", "tab_switch", "fullscreen_exit"}
    if event_data.event_type not in allowed_events:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported focus event")
    event = FocusEvent(session_id=session.id, event_type=event_data.event_type)
    db.add(event)
    db.commit()
    return {"id": event.id, "event_type": event.event_type, "strictness": event_data.strictness}

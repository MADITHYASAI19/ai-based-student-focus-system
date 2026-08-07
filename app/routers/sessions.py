from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import get_current_user
from app.models.models import User
from app.schemas.session import StudySessionOut, StudySessionStart
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
    return start_session(db=db, student_id=current_user.id, plan_item_id=plan_item_id)


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

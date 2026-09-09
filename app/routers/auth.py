from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import get_current_user
from app.core.security import create_access_token
from app.models.models import ItemStatus, PlanItem, QuizAttempt, StudySession, Topic
from app.schemas.auth import UserRegister, UserLogin, UserOut, Token, ProfileOut
from app.services.auth_service import (
    EmailAlreadyExistsError,
    authenticate_user,
    register_user,
)

router = APIRouter()


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    """Register a new user."""
    try:
        return register_user(
            db=db,
            email=user_data.email,
            password=user_data.password,
            name=user_data.name,
            role=user_data.role,
        )
    except EmailAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )


@router.post("/login", response_model=Token)
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    """Authenticate user and return access token."""
    user = authenticate_user(db, email=user_data.email, password=user_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": str(user.id), "email": user.email})
    return Token(access_token=access_token)


@router.get("/me/profile", response_model=ProfileOut)
def get_profile(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Return the authenticated student's profile and learning summary."""
    sessions = (
        db.query(StudySession)
        .filter(StudySession.student_id == current_user.id, StudySession.ended_at.isnot(None))
        .all()
    )
    attempts = db.query(QuizAttempt).filter(QuizAttempt.student_id == current_user.id).all()
    plan_items = (
        db.query(PlanItem)
        .join(PlanItem.study_plan)
        .filter(PlanItem.study_plan.has(student_id=current_user.id))
        .all()
    )

    focus_values = [session.focus_score for session in sessions if session.focus_score is not None]
    focus_score = round(sum(focus_values) / len(focus_values), 1) if focus_values else None
    quiz_average = round(sum(attempt.score for attempt in attempts) / len(attempts), 1) if attempts else None
    completed_items = [item for item in plan_items if item.status == ItemStatus.DONE]
    plan_completion = round((len(completed_items) / len(plan_items)) * 100, 1) if plan_items else 0.0
    study_minutes = sum(
        max(0, int((session.ended_at - session.started_at).total_seconds() // 60))
        for session in sessions
        if session.ended_at and session.started_at
    )

    score_parts = [value for value in (focus_score, quiz_average, plan_completion) if value is not None]
    profile_score = round(sum(score_parts) / len(score_parts), 1) if score_parts else 0.0

    learned_item_ids = {item.id for item in completed_items}
    learned_item_ids.update(session.plan_item_id for session in sessions if session.plan_item_id is not None)
    learned_topic_ids = {
        item.topic_id for item in plan_items if item.id in learned_item_ids
    }
    learned_topics = (
        db.query(Topic)
        .filter(Topic.id.in_(learned_topic_ids))
        .order_by(Topic.name)
        .all()
        if learned_topic_ids
        else []
    )

    return {
        "user": current_user,
        "profile_score": profile_score,
        "focus_score": focus_score,
        "quiz_average": quiz_average,
        "plan_completion": plan_completion,
        "completed_sessions": len(sessions),
        "total_study_minutes": study_minutes,
        "quiz_attempts": len(attempts),
        "learned_topics": [
            {
                "id": topic.id,
                "name": topic.name,
                "subject": topic.subject.name,
                "difficulty": topic.difficulty,
            }
            for topic in learned_topics
        ],
    }

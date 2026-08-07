from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import get_current_user
from app.models.models import User
from app.schemas.plan import StudyPlanCreate, StudyPlanOut
from app.services.plan_service import create_plan, get_plan

router = APIRouter()


@router.post("", response_model=StudyPlanOut, status_code=status.HTTP_201_CREATED)
def create_study_plan(
    plan_data: StudyPlanCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a study plan owned by the authenticated user."""
    return create_plan(
        db=db,
        student_id=current_user.id,
        exam_deadline=plan_data.exam_deadline,
        items=plan_data.items,
    )


@router.get("/{student_id}", response_model=StudyPlanOut)
def get_study_plan(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a study plan by student ID."""
    plan = get_plan(db=db, student_id=student_id)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study plan not found",
        )
    return plan

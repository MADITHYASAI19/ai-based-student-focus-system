from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import get_current_user
from app.models.models import StudyPlan, User, PlanItem
from app.schemas.plan import (
    StudyPlanCreate,
    StudyPlanOut,
    TopicBreakdownRequest,
    TopicBreakdownResponse,
    ItemStatusUpdate,
    TopicExplainRequest,
    TopicExplainResponse,
    PlanItemOut,
)
from app.services.plan_service import create_plan, get_plan, update_item_status, finalize_plan, get_active_plan, get_user_current_state
from ai_service.generation.plan_gen import generate_topic_breakdown
from ai_service.generation.topic_explainer import generate_topic_explanation

router = APIRouter()


@router.post("/breakdown", response_model=TopicBreakdownResponse)
def breakdown_topics(
    request: TopicBreakdownRequest,
    current_user: User = Depends(get_current_user),
):
    """Break down a raw text into study concepts/topics."""
    try:
        topics = generate_topic_breakdown(request.raw_text)
        return TopicBreakdownResponse(topics=topics)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/explain", response_model=TopicExplainResponse)
def explain_topic(
    request: TopicExplainRequest,
    current_user: User = Depends(get_current_user),
):
    """Generate a detailed explanation of a topic for the authenticated student."""
    try:
        explanation = generate_topic_explanation(request.topic_name, request.mode)
        return TopicExplainResponse(topic_name=request.topic_name, explanation=explanation)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("", response_model=list[StudyPlanOut])
def get_all_study_plans(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return every study plan owned by the authenticated user."""
    return (
        db.query(StudyPlan)
        .filter(StudyPlan.student_id == current_user.id)
        .order_by(StudyPlan.generated_at.desc())
        .all()
    )


@router.post("", response_model=StudyPlanOut, status_code=status.HTTP_201_CREATED)
def create_study_plan(
    plan_data: StudyPlanCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a study plan owned by the authenticated user."""
    try:
        return create_plan(
            db=db,
            student_id=current_user.id,
            exam_deadline=plan_data.exam_deadline,
            items=plan_data.items,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/items/{item_id}/status", response_model=PlanItemOut)
def update_plan_item_status(
    item_id: int,
    update: ItemStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the status of a specific plan item (pending/done/skipped)."""
    allowed = {"pending", "done", "skipped"}
    if update.status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Status must be one of {sorted(allowed)}",
        )
    item = update_item_status(db=db, item_id=item_id, student_id=current_user.id, new_status=update.status)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan item not found")
    return item


@router.get("/active/current", response_model=StudyPlanOut | None)
def get_active_study_plan(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the currently active study plan for the authenticated user."""
    return get_active_plan(db=db, student_id=current_user.id)


@router.post("/{plan_id}/finalize", response_model=StudyPlanOut)
def finalize_study_plan(
    plan_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Finalize a study plan as the active plan for the authenticated user."""
    plan = finalize_plan(db=db, plan_id=plan_id, student_id=current_user.id)
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study plan not found",
        )
    return plan


@router.get("/state/current")
def get_current_learning_state(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current learning state (active plan, session) for the authenticated user."""
    return get_user_current_state(db=db, student_id=current_user.id)


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

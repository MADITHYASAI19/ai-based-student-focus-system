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
from app.services.plan_service import create_plan, get_plan, update_item_status, finalize_plan, get_active_plan, get_user_current_state, get_user_topics, get_user_subjects, get_topics_for_subject
from ai_service.generation.topic_explainer import generate_topic_explanation
from ai_service.generation.pipeline import TopicPipeline
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/breakdown", response_model=TopicBreakdownResponse)
def breakdown_topics(
    request: TopicBreakdownRequest,
    current_user: User = Depends(get_current_user),
):
    """Break down a raw text into study concepts/topics using the processing pipeline."""
    try:
        validated_plan, error = TopicPipeline.process_request(request.raw_text)
        if error:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)

        # Convert Pydantic model to the format expected by TopicBreakdownResponse
        topics = [
            {"topic_name": t.name, "duration_minutes": 60} # Defaulting to 60 as subtopics are now priority
            for t in validated_plan.topics
        ]
        # Include subject name in response
        response = TopicBreakdownResponse(topics=topics, subject_name=validated_plan.subject)
        return response
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Breakdown error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An error occurred while processing your study request.") from exc


@router.post("/explain", response_model=TopicExplainResponse)
def explain_topic(
    request: TopicExplainRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a detailed explanation of a topic for the authenticated student.
    
    Checks for existing stored content first to avoid redundant AI calls.
    """
    try:
        # Check if topic exists in database
        from app.models.models import Topic, TopicContent
        from sqlalchemy.orm import joinedload
        
        topic = db.query(Topic).filter(Topic.name == request.topic_name).first()
        
        # If topic exists, check for stored content
        if topic:
            existing_content = db.query(TopicContent).filter(
                TopicContent.topic_id == topic.id,
                TopicContent.student_id == current_user.id,
                TopicContent.explanation_mode == request.mode
            ).first()
            
            if existing_content:
                logger.info(f"Returning stored content for topic {topic.id}, mode {request.mode}")
                return TopicExplainResponse(topic_name=request.topic_name, explanation=existing_content.content)
        
        # Generate new explanation
        explanation = generate_topic_explanation(request.topic_name, request.mode)
        
        # Store the content if topic exists
        if topic:
            content = TopicContent(
                topic_id=topic.id,
                student_id=current_user.id,
                explanation_mode=request.mode,
                content=explanation,
            )
            db.add(content)
            db.commit()
            logger.info(f"Stored new content for topic {topic.id}, mode {request.mode}")
        
        return TopicExplainResponse(topic_name=request.topic_name, explanation=explanation)
    except Exception as exc:
        logger.error(f"Explanation error: {exc}")
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
            subject_name=plan_data.subject_name,
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


@router.get("/topics", status_code=status.HTTP_200_OK)
def get_user_topics_endpoint(
    search: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all topics for the authenticated user, optionally filtered by search query."""
    topics = get_user_topics(db=db, student_id=current_user.id, search_query=search)
    return {"topics": topics}


@router.get("/subjects", status_code=status.HTTP_200_OK)
def get_user_subjects_endpoint(
    search: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all subjects for the authenticated user with topic counts and progress."""
    subjects = get_user_subjects(db=db, student_id=current_user.id, search_query=search)
    return {"subjects": subjects}


@router.get("/subjects/{subject_id}/topics", status_code=status.HTTP_200_OK)
def get_subject_topics_endpoint(
    subject_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all topics for a specific subject that the user has in their plans."""
    topics = get_topics_for_subject(db=db, student_id=current_user.id, subject_id=subject_id)
    return {"topics": topics}


@router.get("/explanations/stored", status_code=status.HTTP_200_OK)
def get_stored_explanations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all stored topic explanations for the authenticated user."""
    from app.models.models import TopicContent, Topic
    from sqlalchemy.orm import joinedload

    explanations = (
        db.query(TopicContent)
        .options(joinedload(TopicContent.topic))
        .filter(TopicContent.student_id == current_user.id)
        .all()
    )

    result = []
    for content in explanations:
        result.append({
            "topic_id": content.topic_id,
            "topic_name": content.topic.name if content.topic else "Unknown",
            "explanation_mode": content.explanation_mode,
            "content": content.content,
            "generated_at": content.generated_at.isoformat(),
        })

    return {"explanations": result}


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

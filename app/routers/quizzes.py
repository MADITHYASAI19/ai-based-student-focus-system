"""
Quizzes router — topic-based quiz generation, submission, history, and analytics.

Existing endpoints (backward compat):
  GET  /api/quizzes/{topic_id}          — legacy: generate quiz (5 MCQ)
  POST /api/quizzes/{quiz_id}/attempt   — legacy: submit answers as dict

New endpoints:
  GET  /api/quizzes/topics/available    — topics the student can be quizzed on
  POST /api/quizzes/generate            — rich quiz generation (multi-type, n_questions)
  POST /api/quizzes/submit              — rich submission with full per-Q results
  GET  /api/quizzes/history             — student's quiz attempt history
  GET  /api/quizzes/topics/{topic_id}/stats  — per-topic performance stats
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import get_current_user
from app.models.models import User
from app.schemas.quiz import (
    QuizOut,
    QuizConfig,
    QuizSubmission,
    QuizAttemptCreate,
    QuizAttemptOut,
    TopicQuizStats,
    AvailableTopic,
)
from app.schemas.face_tracking import FaceTrackingEvent as FaceTrackingEventSchema
from app.services.quiz_service import (
    get_available_topics,
    get_or_generate_quiz,
    submit_quiz,
    record_quiz_attempt,
    get_topic_quiz_stats,
    get_quiz_history,
    QuizTimeoutError,
)
from app.services.face_tracking_service import (
    record_face_tracking_event,
    get_face_tracking_events,
    get_face_tracking_summary,
)
from ai_service.generation.quiz_gen import QuizGenerationError

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Topic picker — load from DB topics the student has in their plans
# ---------------------------------------------------------------------------

@router.get("/topics/available", response_model=list[AvailableTopic], status_code=status.HTTP_200_OK)
def list_available_topics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all topics the authenticated student can be quizzed on."""
    return get_available_topics(student_id=current_user.id, db=db)


# ---------------------------------------------------------------------------
# Quiz generation (rich)
# ---------------------------------------------------------------------------

@router.post("/generate", response_model=QuizOut, status_code=status.HTTP_200_OK)
def generate_quiz_endpoint(
    config: QuizConfig,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a fully configured quiz (multi-type, custom count, time limit)."""
    # Validate question count
    if config.n_questions < 1 or config.n_questions > 30:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="n_questions must be between 1 and 30",
        )

    # Validate topic ownership (topic must be in the student's plan)
    available = get_available_topics(student_id=current_user.id, db=db)
    available_ids = {t.id for t in available}
    if config.topic_id not in available_ids:
        # Still allow it if topic exists globally (not strict ownership for now)
        pass  # Ownership check: topic must exist in DB (validated inside service)

    try:
        quiz = get_or_generate_quiz(
            topic_id=config.topic_id,
            difficulty=config.difficulty,
            db=db,
            question_types=config.question_types,
            n_questions=config.n_questions,
            time_limit_minutes=config.time_limit_minutes,
            face_tracking_enabled=config.face_tracking_enabled,
            fullscreen_required=config.fullscreen_required,
            pdf_source_mode=config.pdf_source_mode,
        )
        return quiz
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except QuizTimeoutError as e:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail={"error": "AI service took too long", "message": "Please try again"},
        )
    except QuizGenerationError as e:
        logger.error("Quiz generation failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": str(e), "message": "Quiz generation failed — please try again"},
        )
    except Exception as e:
        logger.error("Unexpected quiz generation error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Quiz generation service unavailable", "message": "Please try again later"},
        )


# ---------------------------------------------------------------------------
# Quiz submission (rich)
# ---------------------------------------------------------------------------

@router.post("/submit", response_model=QuizAttemptOut, status_code=status.HTTP_201_CREATED)
def submit_quiz_endpoint(
    submission: QuizSubmission,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submit a completed quiz for server-side scoring and persist the attempt."""
    try:
        return submit_quiz(
            submission=submission,
            student_id=current_user.id,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error("Failed to submit quiz: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record quiz attempt",
        )


# ---------------------------------------------------------------------------
# Quiz history
# ---------------------------------------------------------------------------

@router.get("/history", response_model=list[QuizAttemptOut], status_code=status.HTTP_200_OK)
def get_quiz_history_endpoint(
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the authenticated student's quiz attempt history (newest first)."""
    return get_quiz_history(student_id=current_user.id, db=db, limit=limit)


# ---------------------------------------------------------------------------
# Per-topic stats
# ---------------------------------------------------------------------------

@router.get("/topics/{topic_id}/stats", response_model=TopicQuizStats, status_code=status.HTTP_200_OK)
def get_topic_stats_endpoint(
    topic_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return aggregated quiz performance for a specific topic."""
    try:
        return get_topic_quiz_stats(
            topic_id=topic_id,
            student_id=current_user.id,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# ---------------------------------------------------------------------------
# Legacy endpoints (backward compat — keep existing tests passing)
# ---------------------------------------------------------------------------

@router.get("/{topic_id}", response_model=QuizOut, status_code=status.HTTP_200_OK)
def get_quiz(
    topic_id: int,
    difficulty: str = Query(default="medium"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Legacy: retrieve/generate a 5-question MCQ quiz for a topic (cached)."""
    try:
        return get_or_generate_quiz(
            topic_id=topic_id,
            difficulty=difficulty,
            db=db,
            question_types=["mcq"],
            n_questions=5,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except QuizTimeoutError as e:
        logger.error("Quiz generation timed out for topic_id=%s: %s", topic_id, e)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail={"error": "AI service took too long", "message": "Please try again"},
        )
    except QuizGenerationError as e:
        logger.error("Quiz generation failed for topic_id=%s: %s", topic_id, e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": f"Quiz generation failed: {e}", "message": "Please try again later"},
        )
    except Exception as e:
        logger.error("Quiz generation failed for topic_id=%s: %s", topic_id, e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Quiz generation service unavailable", "message": "Please try again later"},
        )


@router.post("/{quiz_id}/attempt", response_model=QuizAttemptOut, status_code=status.HTTP_201_CREATED)
def submit_quiz_attempt(
    quiz_id: int,
    payload: QuizAttemptCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Legacy: submit answers as a dict and get a score back."""
    try:
        attempt = record_quiz_attempt(
            quiz_id=quiz_id,
            student_id=current_user.id,
            answers=payload.answers,
            db=db,
        )
        return QuizAttemptOut(
            id=attempt.id,
            student_id=attempt.student_id,
            quiz_id=attempt.quiz_id,
            score=attempt.score,
            completed_at=attempt.completed_at.isoformat() if attempt.completed_at else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error("Failed to submit quiz attempt for quiz_id=%s: %s", quiz_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record quiz attempt",
        )


# ---------------------------------------------------------------------------
# Quiz attempt details
# ---------------------------------------------------------------------------

@router.get("/attempts/{attempt_id}", response_model=QuizAttemptOut, status_code=status.HTTP_200_OK)
def get_quiz_attempt_endpoint(
    attempt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get details of a specific quiz attempt."""
    from app.models.models import QuizAttempt
    attempt = db.query(QuizAttempt).filter(
        QuizAttempt.id == attempt_id,
        QuizAttempt.student_id == current_user.id
    ).first()
    
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz attempt not found"
        )
    
    return attempt


# ---------------------------------------------------------------------------
# Face tracking endpoints
# ---------------------------------------------------------------------------

@router.post("/attempts/{attempt_id}/face-tracking-events", status_code=status.HTTP_201_CREATED)
def record_face_tracking_event_endpoint(
    attempt_id: int,
    event_data: FaceTrackingEventSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record a face tracking event for a quiz attempt."""
    try:
        event = record_face_tracking_event(
            quiz_attempt_id=attempt_id,
            event_data=event_data,
            db=db,
        )
        return {"id": event.id, "message": "Face tracking event recorded"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error("Failed to record face tracking event: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record face tracking event",
        )


@router.get("/attempts/{attempt_id}/face-tracking-events", status_code=status.HTTP_200_OK)
def get_face_tracking_events_endpoint(
    attempt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all face tracking events for a quiz attempt."""
    try:
        events = get_face_tracking_events(quiz_attempt_id=attempt_id, db=db)
        return [
            {
                "id": e.id,
                "event_type": e.event_type,
                "timestamp": e.timestamp.isoformat() if e.timestamp else None,
                "duration_seconds": e.duration_seconds,
                "event_metadata": e.event_metadata,
            }
            for e in events
        ]
    except Exception as e:
        logger.error("Failed to get face tracking events: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve face tracking events",
        )


@router.get("/attempts/{attempt_id}/face-tracking-summary", status_code=status.HTTP_200_OK)
def get_face_tracking_summary_endpoint(
    attempt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a summary of face tracking events for a quiz attempt."""
    try:
        return get_face_tracking_summary(quiz_attempt_id=attempt_id, db=db)
    except Exception as e:
        logger.error("Failed to get face tracking summary: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve face tracking summary",
        )

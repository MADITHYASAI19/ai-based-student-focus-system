"""
Face tracking service for monitoring student focus during quizzes.
"""
import logging
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

from app.models.models import FaceTrackingEvent, QuizAttempt
from app.schemas.face_tracking import FaceTrackingEvent as FaceTrackingEventSchema

logger = logging.getLogger(__name__)


def record_face_tracking_event(
    quiz_attempt_id: int,
    event_data: FaceTrackingEventSchema,
    db: Session
) -> FaceTrackingEvent:
    """Record a face tracking event for a quiz attempt.
    
    Args:
        quiz_attempt_id: The ID of the quiz attempt
        event_data: The face tracking event data
        db: Database session
        
    Returns:
        The created FaceTrackingEvent
    """
    # Verify quiz attempt exists
    attempt = db.query(QuizAttempt).filter(QuizAttempt.id == quiz_attempt_id).first()
    if not attempt:
        raise ValueError(f"Quiz attempt {quiz_attempt_id} not found")
    
    event = FaceTrackingEvent(
        quiz_attempt_id=quiz_attempt_id,
        event_type=event_data.event_type,
        timestamp=event_data.timestamp or datetime.utcnow(),
        duration_seconds=event_data.duration_seconds,
        event_metadata=event_data.event_metadata
    )
    
    db.add(event)
    db.commit()
    db.refresh(event)
    
    logger.info(f"Recorded face tracking event {event.event_type} for attempt {quiz_attempt_id}")
    return event


def get_face_tracking_events(
    quiz_attempt_id: int,
    db: Session
) -> list[FaceTrackingEvent]:
    """Get all face tracking events for a quiz attempt.
    
    Args:
        quiz_attempt_id: The ID of the quiz attempt
        db: Database session
        
    Returns:
        List of FaceTrackingEvent objects
    """
    return (
        db.query(FaceTrackingEvent)
        .filter(FaceTrackingEvent.quiz_attempt_id == quiz_attempt_id)
        .order_by(FaceTrackingEvent.timestamp)
        .all()
    )


def get_face_tracking_summary(
    quiz_attempt_id: int,
    db: Session
) -> dict:
    """Get a summary of face tracking events for a quiz attempt.
    
    Args:
        quiz_attempt_id: The ID of the quiz attempt
        db: Database session
        
    Returns:
        Dictionary with event counts and summary statistics
    """
    events = get_face_tracking_events(quiz_attempt_id, db)
    
    summary = {
        "total_events": len(events),
        "face_detected_count": 0,
        "face_not_detected_count": 0,
        "multiple_faces_count": 0,
        "focus_lost_count": 0,
        "focus_returned_count": 0,
        "total_duration_seconds": 0
    }
    
    for event in events:
        if event.event_type == "face_detected":
            summary["face_detected_count"] += 1
        elif event.event_type == "face_not_detected":
            summary["face_not_detected_count"] += 1
        elif event.event_type == "multiple_faces":
            summary["multiple_faces_count"] += 1
        elif event.event_type == "focus_lost":
            summary["focus_lost_count"] += 1
        elif event.event_type == "focus_returned":
            summary["focus_returned_count"] += 1
        
        if event.duration_seconds:
            summary["total_duration_seconds"] += event.duration_seconds
    
    return summary

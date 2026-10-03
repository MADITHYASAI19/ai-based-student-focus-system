"""
Focus tracking API endpoints.
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import get_current_user
from app.models.models import User, StudySession, FocusMetric
from app.schemas.focus_tracker import (
    FocusTrackerStart,
    FocusTrackerStatus,
    FocusSessionSummary,
    CurrentMetricsResponse,
    FocusMetricCreate,
    FocusMetricResponse
)
from app.services.focus_tracker_service import FocusTracker

logger = logging.getLogger(__name__)

router = APIRouter()

# Global focus tracker instance (singleton)
_focus_tracker: Optional[FocusTracker] = None


def get_focus_tracker() -> Optional[FocusTracker]:
    """Get the global focus tracker instance."""
    global _focus_tracker
    return _focus_tracker


@router.post("/start", response_model=FocusTrackerStatus, status_code=status.HTTP_201_CREATED)
def start_focus_tracker(
    data: FocusTrackerStart,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start the focus tracker for a study session."""
    global _focus_tracker
    
    # Verify session exists and belongs to user
    session = db.query(StudySession).filter(
        StudySession.id == data.session_id,
        StudySession.student_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study session not found or not authorized"
        )
    
    if session.ended_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot start focus tracker for a completed session"
        )
    
    # Stop existing tracker if running
    if _focus_tracker and _focus_tracker.running:
        logger.warning("Stopping existing focus tracker before starting new one")
        _focus_tracker.stop()
    
    # Start new tracker
    _focus_tracker = FocusTracker(camera_id=data.camera_id)
    success = _focus_tracker.start(session_id=data.session_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start focus tracker (camera error)"
        )
    
    return FocusTrackerStatus(
        running=True,
        session_id=data.session_id,
        current_metrics=None
    )


@router.post("/stop", response_model=FocusSessionSummary)
def stop_focus_tracker(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stop the focus tracker and return session summary."""
    global _focus_tracker
    
    if not _focus_tracker or not _focus_tracker.running:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Focus tracker is not running"
        )
    
    # Get summary before stopping
    summary = _focus_tracker.get_session_summary()
    
    # Update session with final scores
    if summary and summary["session_id"]:
        session = db.query(StudySession).filter(
            StudySession.id == summary["session_id"],
            StudySession.student_id == current_user.id
        ).first()
        
        if session:
            session.focus_score = summary["focus_score"]
            session.productivity_score = summary["productivity_score"]
            db.commit()
    
    # Stop tracker
    _focus_tracker.stop()
    _focus_tracker = None
    
    if not summary:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get session summary"
        )
    
    return FocusSessionSummary(**summary)


@router.get("/status", response_model=FocusTrackerStatus)
def get_tracker_status(
    current_user: User = Depends(get_current_user),
):
    """Get the current status of the focus tracker."""
    global _focus_tracker
    
    if not _focus_tracker:
        return FocusTrackerStatus(running=False, session_id=None, current_metrics=None)
    
    return FocusTrackerStatus(
        running=_focus_tracker.running,
        session_id=_focus_tracker.session_id,
        current_metrics=_focus_tracker.get_current_metrics()
    )


@router.get("/metrics/current", response_model=CurrentMetricsResponse)
def get_current_metrics(
    current_user: User = Depends(get_current_user),
):
    """Get the current focus metrics (for polling)."""
    global _focus_tracker
    
    if not _focus_tracker or not _focus_tracker.running:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Focus tracker is not running"
        )
    
    metrics = _focus_tracker.get_current_metrics()
    
    if not metrics:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No metrics available yet"
        )
    
    return CurrentMetricsResponse(**metrics)


@router.post("/metrics", response_model=FocusMetricResponse, status_code=status.HTTP_201_CREATED)
def record_focus_metric(
    metric_data: FocusMetricCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record a focus metric (called by background service)."""
    # Verify session exists and belongs to user
    session = db.query(StudySession).filter(
        StudySession.id == metric_data.session_id,
        StudySession.student_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study session not found or not authorized"
        )
    
    # Create metric record
    metric = FocusMetric(
        session_id=metric_data.session_id,
        face_present=metric_data.face_present,
        face_count=metric_data.face_count,
        ear=metric_data.ear,
        eyes_closed=metric_data.eyes_closed,
        drowsy=metric_data.drowsy,
        gaze=metric_data.gaze,
        head_pose_status=metric_data.head_pose_status,
        yaw=metric_data.yaw,
        pitch=metric_data.pitch,
        roll=metric_data.roll,
        blink_rate=metric_data.blink_rate,
        look_away_duration=metric_data.look_away_duration,
        focus_score=metric_data.focus_score,
        productivity_score=metric_data.productivity_score,
        is_focused=metric_data.is_focused
    )
    
    db.add(metric)
    db.commit()
    db.refresh(metric)
    
    logger.info(f"Recorded focus metric for session {metric_data.session_id}")
    return metric


@router.get("/sessions/{session_id}/metrics", response_model=list[FocusMetricResponse])
def get_session_metrics(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all focus metrics for a study session."""
    # Verify session exists and belongs to user
    session = db.query(StudySession).filter(
        StudySession.id == session_id,
        StudySession.student_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study session not found or not authorized"
        )
    
    metrics = db.query(FocusMetric).filter(
        FocusMetric.session_id == session_id
    ).order_by(FocusMetric.timestamp).all()
    
    return metrics

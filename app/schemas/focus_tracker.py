"""
Schemas for focus tracking API.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class FocusMetricCreate(BaseModel):
    """Schema for creating a focus metric record."""
    session_id: int
    
    # Vision metrics
    face_present: bool = False
    face_count: int = 0
    ear: Optional[float] = None
    eyes_closed: bool = False
    drowsy: bool = False
    gaze: Optional[str] = None
    head_pose_status: Optional[str] = None
    yaw: Optional[float] = None
    pitch: Optional[float] = None
    roll: Optional[float] = None
    blink_rate: int = 0
    look_away_duration: Optional[float] = None
    
    # Focus scores
    focus_score: float
    productivity_score: float
    is_focused: bool


class FocusMetricResponse(BaseModel):
    """Schema for focus metric response."""
    id: int
    session_id: int
    timestamp: datetime
    
    # Vision metrics
    face_present: bool
    face_count: int
    ear: Optional[float]
    eyes_closed: bool
    drowsy: bool
    gaze: Optional[str]
    head_pose_status: Optional[str]
    yaw: Optional[float]
    pitch: Optional[float]
    roll: Optional[float]
    blink_rate: int
    look_away_duration: Optional[float]
    
    # Focus scores
    focus_score: float
    productivity_score: float
    is_focused: bool
    
    class Config:
        from_attributes = True


class FocusTrackerStart(BaseModel):
    """Schema for starting focus tracker."""
    session_id: int
    camera_id: Optional[int] = Field(default=0, description="Camera device ID (default: 0)")


class FocusTrackerStatus(BaseModel):
    """Schema for focus tracker status."""
    running: bool
    session_id: Optional[int] = None
    current_metrics: Optional[dict] = None


class FocusSessionSummary(BaseModel):
    """Schema for focus session summary."""
    session_id: Optional[int]
    total_study_sec: int
    focused_sec: int
    distracted_sec: int
    focus_score: float
    productivity_score: float
    look_away_count: int
    drowsy_event_count: int
    blink_count: int


class CurrentMetricsResponse(BaseModel):
    """Schema for current focus metrics (for polling)."""
    face_present: bool
    face_count: int
    ear: Optional[float]
    eyes_closed: bool
    drowsy: bool
    gaze: Optional[str]
    head_pose_status: Optional[str]
    yaw: Optional[float]
    pitch: Optional[float]
    roll: Optional[float]
    blink_rate: int
    look_away_duration: Optional[float]
    focus_score: float
    productivity_score: float
    is_focused: bool
    total_study_sec: int
    focused_sec: int
    distracted_sec: int
    look_away_count: int
    drowsy_event_count: int
    timestamp: float

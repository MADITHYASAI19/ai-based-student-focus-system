from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class FaceTrackingEvent(BaseModel):
    """Schema for a face tracking event during a quiz."""
    event_type: str  # face_detected, face_not_detected, multiple_faces, focus_lost, focus_returned
    timestamp: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    event_metadata: Optional[dict] = None


class FaceTrackingConfig(BaseModel):
    """Configuration for face tracking during a quiz."""
    enabled: bool = False
    required: bool = False  # If true, quiz cannot start without face tracking

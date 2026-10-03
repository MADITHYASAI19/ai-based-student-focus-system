from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import subprocess
import sys
import os

from app.core.database import get_db
from app.core.config import get_settings
from app.deps import get_current_user
from app.models.models import User, StudySession
from app.schemas.session import FocusEventCreate, StudySessionOut, StudySessionStart
from app.models.models import FocusEvent
from app.services.session_service import end_session, get_session, start_session

router = APIRouter()

# Track running tracker process (one per server lifecycle)
_tracker_process: subprocess.Popen | None = None

TRACKER_SCRIPT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "focus_tracker_pro.py"
)

def _launch_tracker():
    global _tracker_process
    _kill_tracker()
    settings = get_settings()
    cmd = [sys.executable, TRACKER_SCRIPT, "--api-url", settings.TRACKER_API_URL]
    if settings.TRACKER_EMAIL:
        cmd += ["--email", settings.TRACKER_EMAIL]
    if settings.TRACKER_PASSWORD:
        cmd += ["--password", settings.TRACKER_PASSWORD]
    try:
        if sys.platform.startswith("win"):
            _tracker_process = subprocess.Popen(cmd, creationflags=subprocess.CREATE_NEW_CONSOLE)
        else:
            _tracker_process = subprocess.Popen(["x-terminal-emulator", "-e"] + cmd)
        print(f"[Tracker] Launched focus_tracker_pro.py (PID {_tracker_process.pid})")
    except Exception as e:
        print(f"[Tracker] Could not launch tracker: {e}")

def _kill_tracker():
    global _tracker_process
    if _tracker_process and _tracker_process.poll() is None:
        try:
            _tracker_process.terminate()
            print(f"[Tracker] Stopped tracker (PID {_tracker_process.pid})")
        except Exception as e:
            print(f"[Tracker] Could not stop tracker: {e}")
    _tracker_process = None



@router.get("", response_model=list[StudySessionOut])
def get_session_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all completed sessions for the authenticated user, newest first."""
    return (
        db.query(StudySession)
        .filter(
            StudySession.student_id == current_user.id,
            StudySession.ended_at.isnot(None),
        )
        .order_by(StudySession.started_at.desc())
        .all()
    )


@router.get("/active", response_model=StudySessionOut)
def get_active_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the currently active (in-progress) session for the authenticated user, if any."""
    session = (
        db.query(StudySession)
        .filter(
            StudySession.student_id == current_user.id,
            StudySession.ended_at.is_(None),
        )
        .order_by(StudySession.started_at.desc())
        .first()
    )
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active session found"
        )
    
    return session



@router.post("/start", response_model=StudySessionOut, status_code=status.HTTP_201_CREATED)
def start_study_session(
    session_data: StudySessionStart | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Start a study session for the authenticated user and launch the AI tracker."""
    plan_item_id = session_data.plan_item_id if session_data else None
    result = start_session(
        db=db,
        student_id=current_user.id,
        plan_item_id=plan_item_id,
        document_id=session_data.document_id if session_data else None,
        subtopic=session_data.subtopic if session_data else None,
        explanation_mode=session_data.explanation_mode if session_data else "average",
        duration_minutes=session_data.duration_minutes if session_data else None,
    )
    # Auto-launch AI focus tracker in a new window
    # _launch_tracker()  # Disabled to prevent dual-tracker collision with browser tracker
    return result


@router.patch("/{session_id}/end", response_model=StudySessionOut)
def end_study_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """End a study session and stop the AI tracker."""
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
    result = end_session(db=db, session=session)
    # Auto-stop the tracker when session ends
    _kill_tracker()
    return result


@router.post("/{session_id}/events", status_code=status.HTTP_201_CREATED)
def record_focus_event(
    session_id: int,
    event_data: FocusEventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record a derived browser monitoring event; raw camera data is never accepted."""
    session = get_session(db=db, session_id=session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Study session not found")
    if session.student_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to record this event")
    allowed_events = {
        "phone_detected",
        "phone_cleared",
        "away",
        "no_face",
        "face_detected",
        "looking_away",
        "multiple_faces",
        "camera_error",
        "camera_stopped",
        "sleepy",
        "tab_switch",
        "fullscreen_exit",
        # Support uppercase equivalents as well
        "NO_FACE",
        "FACE_DETECTED",
        "LOOKING_AWAY",
        "MULTIPLE_FACES",
        "PHONE_DETECTED",
        "PHONE_CLEARED",
        "CAMERA_ERROR",
        "CAMERA_STOPPED",
    }
    if event_data.event_type not in allowed_events:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported focus event")
    event = FocusEvent(session_id=session.id, event_type=event_data.event_type)
    db.add(event)
    db.commit()
    return {"id": event.id, "event_type": event.event_type, "strictness": event_data.strictness}

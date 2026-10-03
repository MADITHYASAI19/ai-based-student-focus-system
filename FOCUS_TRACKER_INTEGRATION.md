# Focus Tracker Integration Guide

This document explains how to use the integrated focus tracking system in the AI Study Platform.

## Overview

The focus tracker has been integrated as a background service that monitors student focus during study sessions using computer vision. It captures core focus metrics including:

- **Face presence & count**: Detects if a student is present at their desk
- **Eye tracking**: Monitors eye aspect ratio (EAR) for blink detection
- **Gaze direction**: Estimates where the student is looking (screen, left, right, up, down)
- **Head pose**: Tracks head orientation to detect looking away
- **Focus score**: Calculated from vision metrics (0-100)
- **Productivity score**: Percentage of time spent focused

## Architecture

### Components

1. **Focus Tracker Service** (`app/services/focus_tracker_service.py`)
   - `VisionPipeline`: Processes camera frames using MediaPipe
   - `FocusEngine`: Calculates focus scores from vision data
   - `FocusTracker`: Orchestrates the tracking process

2. **API Endpoints** (`app/routers/focus_tracker.py`)
   - `POST /api/focus-tracker/start`: Start tracking for a session
   - `POST /api/focus-tracker/stop`: Stop tracking and get summary
   - `GET /api/focus-tracker/status`: Get tracker status
   - `GET /api/focus-tracker/metrics/current`: Get current metrics (for polling)
   - `POST /api/focus-tracker/metrics`: Record metrics (called by background service)
   - `GET /api/focus-tracker/sessions/{session_id}/metrics`: Get all metrics for a session

3. **Background Service** (`focus_tracker_service.py`)
   - Runs independently as a separate process
   - Sends metrics to the API at regular intervals
   - Communicates via HTTP requests

4. **Database Models**
   - `FocusMetric`: Stores real-time focus metrics with timestamps
   - `StudySession`: Updated with final focus/productivity scores

## Usage

### Starting a Study Session with Focus Tracking

1. **Start a study session** via the sessions API:
   ```bash
   POST /api/sessions/start
   {
     "plan_item_id": 1,
     "explanation_mode": "average"
   }
   ```

2. **Start the focus tracker** for the session:
   ```bash
   POST /api/focus-tracker/start
   {
     "session_id": 123,
     "camera_id": 0
   }
   ```

3. **Run the background service** (separate terminal):
   ```bash
   python focus_tracker_service.py \
     --api-url http://localhost:8000 \
     --session-id 123 \
     --camera-id 0 \
     --auth-token YOUR_JWT_TOKEN
   ```

4. **Poll for current metrics** (frontend):
   ```bash
   GET /api/focus-tracker/metrics/current
   ```

5. **Stop the tracker** when done:
   ```bash
   POST /api/focus-tracker/stop
   ```

6. **End the study session**:
   ```bash
   PATCH /api/sessions/{session_id}/end
   ```

### Running the Background Service

The background service can be run as a standalone process:

```bash
python focus_tracker_service.py \
  --api-url http://localhost:8000 \
  --session-id 123 \
  --camera-id 0 \
  --metrics-interval 2.0 \
  --auth-token YOUR_JWT_TOKEN
```

**Options:**
- `--api-url`: Base URL of the API (default: http://localhost:8000)
- `--session-id`: Study session ID to track (required)
- `--camera-id`: Camera device ID (default: 0)
- `--metrics-interval`: Seconds between sending metrics to API (default: 2.0)
- `--auth-token`: JWT auth token for API requests

### Frontend Integration (Polling)

The frontend can poll the current metrics endpoint to display real-time focus data:

```javascript
async function pollFocusMetrics(sessionId) {
  const response = await fetch('/api/focus-tracker/metrics/current');
  const metrics = await response.json();
  
  // Update UI with metrics
  updateFocusDisplay(metrics);
  
  // Poll again after 2 seconds
  setTimeout(() => pollFocusMetrics(sessionId), 2000);
}
```

### API Response Examples

**Start Tracker Response:**
```json
{
  "running": true,
  "session_id": 123,
  "current_metrics": null
}
```

**Current Metrics Response:**
```json
{
  "face_present": true,
  "face_count": 1,
  "ear": 0.25,
  "eyes_closed": false,
  "drowsy": false,
  "gaze": "Facing Screen",
  "head_pose_status": "Facing Screen",
  "yaw": 5.2,
  "pitch": 3.1,
  "roll": 1.5,
  "blink_rate": 15,
  "look_away_duration": 0.0,
  "focus_score": 85.5,
  "productivity_score": 78.2,
  "is_focused": true,
  "total_study_sec": 300,
  "focused_sec": 240,
  "distracted_sec": 60,
  "look_away_count": 2,
  "drowsy_event_count": 0,
  "timestamp": 1727956800.0
}
```

**Session Summary Response:**
```json
{
  "session_id": 123,
  "total_study_sec": 1800,
  "focused_sec": 1500,
  "distracted_sec": 300,
  "focus_score": 83.3,
  "productivity_score": 83.3,
  "look_away_count": 5,
  "drowsy_event_count": 0,
  "blink_count": 45
}
```

## Database Migration

Before using the focus tracker, run the database migration:

```bash
alembic upgrade head
```

This will create the `focus_metrics` table.

## Focus Score Calculation

The focus score is calculated as a weighted average:

```
focus_score = 0.40 * eye_score + 0.35 * head_score + 0.25 * face_score
```

Where:
- `eye_score`: 100 if EAR > 0.20 and eyes not closed, else 0
- `head_score`: 100 if facing screen, else 30
- `face_score`: 100 if face present and count == 1, else 0

A score >= 65 is considered "focused".

## Security Considerations

- The focus tracker requires authentication via JWT token
- Only the session owner can start/stop tracking for their sessions
- Camera data is processed locally; only metrics are sent to the API
- No video frames are stored or transmitted

## Troubleshooting

**Camera not opening:**
- Check camera permissions
- Verify camera ID (try 0, 1, 2, etc.)
- Ensure no other application is using the camera

**API connection errors:**
- Verify API is running at the specified URL
- Check authentication token is valid
- Ensure session ID exists and belongs to the user

**Low focus scores:**
- Ensure adequate lighting
- Position camera to capture face clearly
- Maintain distance of 0.5-1 meter from camera

## Future Enhancements

Potential additions to the focus tracker:

- Object detection (phone, food, drinks)
- Audio monitoring (speaking detection)
- Emotion recognition
- Posture analysis
- Multi-camera support
- Real-time alerts and notifications

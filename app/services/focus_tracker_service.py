"""
Simplified Focus Tracker Service
Extracts core focus tracking features from focus_tracker_pro.py for backend integration.
"""
import cv2
import mediapipe as mp
import numpy as np
import time
from collections import deque
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

# MediaPipe Solutions
mp_face_mesh = mp.solutions.face_mesh
mp_pose = mp.solutions.pose

# Landmark Indices
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]
LEFT_IRIS = [468, 469, 470, 471]
RIGHT_IRIS = [473, 474, 475, 476]
POSE_HEAD_LANDMARKS = [1, 152, 33, 263, 61, 291]

MODEL_POINTS_3D = np.array([
    (0.0, 0.0, 0.0),
    (0.0, -330.0, -65.0),
    (-225.0, 170.0, -135.0),
    (225.0, 170.0, -135.0),
    (-150.0, -150.0, -125.0),
    (150.0, -150.0, -125.0),
], dtype=np.float64)


class VisionPipeline:
    """Core vision pipeline for face tracking and focus analysis."""
    
    def __init__(self):
        self.face_mesh = mp_face_mesh.FaceMesh(
            max_num_faces=3,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        self.pose = mp_pose.Pose(
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        
        # State tracking
        self.blink_count = 0
        self.eye_state_closed = False
        self.blink_start_time = 0.0
        self.blink_times = deque(maxlen=60)
        self.look_away_start = None
        self.look_away_count = 0
    
    def compute_ear(self, landmarks, eye_indices, w, h):
        """Compute Eye Aspect Ratio for blink detection."""
        pts = np.array([(landmarks[i].x * w, landmarks[i].y * h) for i in eye_indices])
        v1 = np.linalg.norm(pts[1] - pts[5])
        v2 = np.linalg.norm(pts[2] - pts[4])
        horiz = np.linalg.norm(pts[0] - pts[3])
        return (v1 + v2) / (2.0 * horiz + 1e-6)
    
    def estimate_gaze(self, landmarks, w, h):
        """Estimate gaze direction based on iris position."""
        try:
            left_iris_center = np.mean([(landmarks[i].x * w, landmarks[i].y * h) for i in LEFT_IRIS], axis=0)
            right_iris_center = np.mean([(landmarks[i].x * w, landmarks[i].y * h) for i in RIGHT_IRIS], axis=0)
            
            left_corner = np.array([landmarks[33].x * w, landmarks[33].y * h])
            right_corner = np.array([landmarks[133].x * w, landmarks[133].y * h])
            
            eye_width = np.linalg.norm(right_corner - left_corner) + 1e-6
            relative_x = (left_iris_center[0] - left_corner[0]) / eye_width
            
            if relative_x < 0.35:
                return "Looking Right"
            elif relative_x > 0.65:
                return "Looking Left"
            
            top_lid = np.array([landmarks[159].x * w, landmarks[159].y * h])
            bot_lid = np.array([landmarks[145].x * w, landmarks[145].y * h])
            eye_height = np.linalg.norm(bot_lid - top_lid) + 1e-6
            relative_y = (left_iris_center[1] - top_lid[1]) / eye_height
            
            if relative_y < 0.30:
                return "Looking Up"
            elif relative_y > 0.75:
                return "Looking Down"
            
            return "Facing Screen"
        except:
            return "Gaze Unknown"
    
    def estimate_head_pose(self, landmarks, w, h):
        """Estimate head pose using solvePnP."""
        try:
            image_points = np.array(
                [(landmarks[i].x * w, landmarks[i].y * h) for i in POSE_HEAD_LANDMARKS],
                dtype=np.float64
            )
            focal_length = w
            center = (w / 2, h / 2)
            camera_matrix = np.array(
                [[focal_length, 0, center[0]],
                 [0, focal_length, center[1]],
                 [0, 0, 1]], dtype=np.float64
            )
            dist_coeffs = np.zeros((4, 1))
            
            success, rotation_vec, _ = cv2.solvePnP(
                MODEL_POINTS_3D, image_points, camera_matrix, dist_coeffs,
                flags=cv2.SOLVEPNP_ITERATIVE
            )
            if not success:
                return 0.0, 0.0, 0.0
            
            rmat, _ = cv2.Rodrigues(rotation_vec)
            sy = np.sqrt(rmat[0, 0] ** 2 + rmat[1, 0] ** 2)
            pitch = np.degrees(np.arctan2(-rmat[2, 0], sy))
            yaw = np.degrees(np.arctan2(rmat[1, 0], rmat[0, 0]))
            roll = np.degrees(np.arctan2(rmat[2, 1], rmat[2, 2]))
            return yaw, pitch, roll
        except:
            return 0.0, 0.0, 0.0
    
    def process_frame(self, frame):
        """Process a frame and return focus metrics."""
        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        now = time.time()
        
        res_mesh = self.face_mesh.process(rgb)
        res_pose = self.pose.process(rgb)
        
        results = {
            "face_present": False,
            "face_count": 0,
            "ear": 0.0,
            "eyes_closed": False,
            "drowsy": False,
            "gaze": "No Face",
            "yaw": 0.0,
            "pitch": 0.0,
            "roll": 0.0,
            "head_pose_status": "No Face",
            "student_present": False,
            "blink_rate": 0,
            "look_away_duration": 0.0
        }
        
        if res_mesh.multi_face_landmarks:
            results["face_count"] = len(res_mesh.multi_face_landmarks)
            results["face_present"] = True
            landmarks = res_mesh.multi_face_landmarks[0].landmark
            
            # Eye aspect ratio
            ear_l = self.compute_ear(landmarks, LEFT_EYE, w, h)
            ear_r = self.compute_ear(landmarks, RIGHT_EYE, w, h)
            avg_ear = (ear_l + ear_r) / 2.0
            results["ear"] = avg_ear
            
            # Blink detection
            if avg_ear < 0.20:
                if not self.eye_state_closed:
                    self.eye_state_closed = True
                    self.blink_start_time = now
                closed_duration = now - self.blink_start_time
                if closed_duration > 1.2:
                    results["eyes_closed"] = True
                if closed_duration > 2.0:
                    results["drowsy"] = True
            else:
                if self.eye_state_closed:
                    self.eye_state_closed = False
                    self.blink_count += 1
                    self.blink_times.append(now)
            
            # Blink rate (per minute)
            self.blink_times = deque([t for t in self.blink_times if now - t <= 60], maxlen=60)
            results["blink_rate"] = len(self.blink_times)
            
            # Gaze estimation
            results["gaze"] = self.estimate_gaze(landmarks, w, h)
            
            # Head pose
            yaw, pitch, roll = self.estimate_head_pose(landmarks, w, h)
            results["yaw"], results["pitch"], results["roll"] = yaw, pitch, roll
            
            # Head pose status
            if abs(yaw) < 20 and abs(pitch) < 18:
                results["head_pose_status"] = "Facing Screen"
            elif yaw < -20:
                results["head_pose_status"] = "Looking Left"
            elif yaw > 20:
                results["head_pose_status"] = "Looking Right"
            elif pitch > 18:
                results["head_pose_status"] = "Looking Down"
            else:
                results["head_pose_status"] = "Looking Up"
            
            # Look away tracking
            if results["head_pose_status"] != "Facing Screen":
                if self.look_away_start is None:
                    self.look_away_start = now
                elif now - self.look_away_start > 15.0:
                    self.look_away_count += 1
                results["look_away_duration"] = now - self.look_away_start
            else:
                self.look_away_start = None
                results["look_away_duration"] = 0.0
        
        if res_pose.pose_landmarks:
            results["student_present"] = True
        
        return results


class FocusEngine:
    """Calculates focus scores based on vision metrics."""
    
    def __init__(self):
        self.session_start_time = time.time()
        self.total_focused_time = 0.0
        self.total_distracted_time = 0.0
        self.last_update_time = time.time()
        self.focus_score_history = deque(maxlen=60)
        self.look_away_count = 0
        self.drowsy_event_count = 0
    
    def update(self, vision_data):
        """Update focus metrics based on vision data."""
        now = time.time()
        dt = min(now - self.last_update_time, 1.0)
        self.last_update_time = now
        
        # Calculate component scores
        eye_score = 100.0 if (vision_data["ear"] > 0.20 and not vision_data["eyes_closed"]) else 0.0
        head_score = 100.0 if vision_data["head_pose_status"] == "Facing Screen" else 30.0
        face_score = 100.0 if (vision_data["face_present"] and vision_data["face_count"] == 1) else 0.0
        
        # Weighted focus score
        focus_score = (
            0.40 * eye_score +
            0.35 * head_score +
            0.25 * face_score
        )
        
        is_focused = focus_score >= 65.0
        self.focus_score_history.append(focus_score)
        
        # Track time
        if is_focused:
            self.total_focused_time += dt
        else:
            self.total_distracted_time += dt
        
        # Track events
        if vision_data["drowsy"]:
            self.drowsy_event_count += 1
        if vision_data["head_pose_status"] != "Facing Screen" and vision_data["look_away_duration"] > 15.0:
            self.look_away_count += 1
        
        # Calculate productivity score
        total_tracked = max(1.0, self.total_focused_time + self.total_distracted_time)
        focused_pct = (self.total_focused_time / total_tracked) * 100.0
        productivity_score = max(0.0, min(100.0, focused_pct))
        
        return {
            "focus_score": focus_score,
            "productivity_score": productivity_score,
            "is_focused": is_focused,
            "total_study_sec": int(now - self.session_start_time),
            "focused_sec": int(self.total_focused_time),
            "distracted_sec": int(self.total_distracted_time),
            "look_away_count": self.look_away_count,
            "drowsy_event_count": self.drowsy_event_count
        }


class FocusTracker:
    """Main focus tracker orchestrator."""
    
    def __init__(self, camera_id: int = 0):
        self.camera_id = camera_id
        self.vision_pipeline = VisionPipeline()
        self.focus_engine = FocusEngine()
        self.cap = None
        self.running = False
        self.session_id: Optional[int] = None
        self.current_metrics: Optional[Dict[str, Any]] = None
    
    def start(self, session_id: Optional[int] = None):
        """Start the focus tracker."""
        if self.running:
            logger.warning("Focus tracker already running")
            return False
        
        try:
            self.cap = cv2.VideoCapture(self.camera_id)
            if not self.cap.isOpened():
                logger.error(f"Could not open camera {self.camera_id}")
                return False
            
            # Set resolution
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            
            self.session_id = session_id
            self.running = True
            logger.info(f"Focus tracker started for session {session_id}")
            return True
        except Exception as e:
            logger.error(f"Error starting focus tracker: {e}")
            return False
    
    def process_frame(self):
        """Process a single frame and return metrics."""
        if not self.running or not self.cap:
            return None
        
        try:
            ok, frame = self.cap.read()
            if not ok:
                logger.warning("Failed to read frame")
                return None
            
            frame = cv2.flip(frame, 1)
            
            # Process vision
            vision_results = self.vision_pipeline.process_frame(frame)
            
            # Update focus engine
            metrics = self.focus_engine.update(vision_results)
            
            # Combine results
            self.current_metrics = {
                **vision_results,
                **metrics,
                "session_id": self.session_id,
                "timestamp": time.time()
            }
            
            return self.current_metrics
        except Exception as e:
            logger.error(f"Error processing frame: {e}")
            return None
    
    def get_current_metrics(self):
        """Get the most recent metrics."""
        return self.current_metrics
    
    def stop(self):
        """Stop the focus tracker."""
        if not self.running:
            return
        
        self.running = False
        if self.cap:
            self.cap.release()
            self.cap = None
        
        logger.info(f"Focus tracker stopped for session {self.session_id}")
    
    def get_session_summary(self):
        """Get session summary statistics."""
        if not self.current_metrics:
            return None
        
        return {
            "session_id": self.session_id,
            "total_study_sec": self.focus_engine.total_focused_time + self.focus_engine.total_distracted_time,
            "focused_sec": self.focus_engine.total_focused_time,
            "distracted_sec": self.focus_engine.total_distracted_time,
            "focus_score": self.current_metrics.get("focus_score", 0),
            "productivity_score": self.current_metrics.get("productivity_score", 0),
            "look_away_count": self.focus_engine.look_away_count,
            "drowsy_event_count": self.focus_engine.drowsy_event_count,
            "blink_count": self.vision_pipeline.blink_count
        }

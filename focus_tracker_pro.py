"""
Focus Tracker AI Pro — Ultimate 30-in-1 AI Study Companion
Fixed version with better error handling and debugging
"""

import cv2
import mediapipe as mp
import numpy as np
import time
import math
import threading
import json
import os
import sys
import psutil
from collections import deque
import warnings
warnings.filterwarnings('ignore')

# Platform specifics
IS_WINDOWS = sys.platform.startswith("win")
if IS_WINDOWS:
    import ctypes
    from ctypes import Structure, c_uint, sizeof, byref

# Optional imports
try:
    import sounddevice as sd
    HAS_SOUNDDEVICE = True
except Exception:
    HAS_SOUNDDEVICE = False

try:
    from ultralytics import YOLO
    HAS_YOLO = True
except Exception:
    HAS_YOLO = False

try:
    from pynput import keyboard, mouse
    HAS_PYNPUT = True
except Exception:
    HAS_PYNPUT = False

# MediaPipe Solutions
mp_face_mesh = mp.solutions.face_mesh
mp_pose = mp.solutions.pose
mp_hands = mp.solutions.hands

# Landmark Indices
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]
LEFT_IRIS = [468, 469, 470, 471]
RIGHT_IRIS = [473, 474, 475, 476]
MOUTH_INNER = [13, 14, 78, 308]
POSE_HEAD_LANDMARKS = [1, 152, 33, 263, 61, 291]

MODEL_POINTS_3D = np.array([
    (0.0, 0.0, 0.0),
    (0.0, -330.0, -65.0),
    (-225.0, 170.0, -135.0),
    (225.0, 170.0, -135.0),
    (-150.0, -150.0, -125.0),
    (150.0, -150.0, -125.0),
], dtype=np.float64)

# ============================================================================
# AUDIO MONITOR
# ============================================================================
class AudioMonitor:
    def __init__(self, sample_rate=16000, block_size=1600):
        self.sample_rate = sample_rate
        self.block_size = block_size
        self.current_rms = 0.0
        self.sound_class = "Quiet"
        self.is_speaking = False
        self.running = False
        self.stream = None
        self.audio_history = deque(maxlen=10)
        self.noise_level = "Low"

    def start(self):
        if not HAS_SOUNDDEVICE:
            print("[AudioMonitor] Sounddevice not available.")
            return
        try:
            self.running = True
            self.stream = sd.InputStream(
                channels=1,
                samplerate=self.sample_rate,
                blocksize=self.block_size,
                callback=self._audio_callback
            )
            self.stream.start()
            print("[AudioMonitor] Started.")
        except Exception as e:
            print(f"[AudioMonitor] Warning: {e}")
            self.running = False

    def _audio_callback(self, indata, frames, time_info, status):
        if not self.running:
            return
        rms = np.sqrt(np.mean(indata**2))
        self.current_rms = float(rms)
        self.audio_history.append(rms)

        if rms < 0.008:
            self.sound_class = "🔇 Silent"
            self.is_speaking = False
            self.noise_level = "Low"
        elif rms < 0.025:
            self.sound_class = "🔊 Quiet"
            self.is_speaking = False
            self.noise_level = "Low"
        elif rms < 0.055:
            self.sound_class = "🗣️ Speaking"
            self.is_speaking = True
            self.noise_level = "Moderate"
        elif rms < 0.12:
            self.sound_class = "📢 People Talking"
            self.is_speaking = True
            self.noise_level = "High"
        else:
            self.sound_class = "🔊 Loud Noise"
            self.is_speaking = False
            self.noise_level = "Very High"

    def stop(self):
        self.running = False
        if self.stream:
            try:
                self.stream.stop()
                self.stream.close()
            except Exception:
                pass

# ============================================================================
# SYSTEM ACTIVITY TRACKER
# ============================================================================
class SystemActivityTracker:
    def __init__(self):
        self.key_presses = 0
        self.mouse_clicks = 0
        self.mouse_movements = 0
        self.last_key_time = time.time()
        self.last_mouse_time = time.time()
        self.active_window_title = "Unknown"
        self.active_app_category = "Neutral"
        self.typing_speed_wpm = 0
        self.key_history = deque(maxlen=60)
        self.click_history = deque(maxlen=60)
        self._start_listeners()

    def _start_listeners(self):
        if HAS_PYNPUT:
            def on_press(key):
                self.key_presses += 1
                self.last_key_time = time.time()
                self.key_history.append(time.time())

            def on_click(x, y, button, pressed):
                if pressed:
                    self.mouse_clicks += 1
                    self.last_mouse_time = time.time()
                    self.click_history.append(time.time())

            def on_move(x, y):
                self.mouse_movements += 1
                self.last_mouse_time = time.time()

            try:
                self.k_listener = keyboard.Listener(on_press=on_press)
                self.k_listener.daemon = True
                self.k_listener.start()

                self.m_listener = mouse.Listener(on_move=on_move, on_click=on_click)
                self.m_listener.daemon = True
                self.m_listener.start()
            except Exception as e:
                print(f"[SystemActivity] Warning: {e}")

    def get_system_idle_seconds(self):
        if IS_WINDOWS:
            try:
                class LASTINPUTINFO(ctypes.Structure):
                    _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]
                lii = LASTINPUTINFO()
                lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
                if ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii)):
                    millis = ctypes.windll.kernel32.GetTickCount() - lii.dwTime
                    return millis / 1000.0
            except Exception:
                pass
        return time.time() - max(self.last_key_time, self.last_mouse_time)

    def get_typing_speed(self):
        now = time.time()
        recent_keys = [t for t in self.key_history if now - t < 60]
        self.typing_speed_wpm = len(recent_keys) / 5
        return self.typing_speed_wpm

    def update_active_app(self):
        title = "Unknown App"
        if IS_WINDOWS:
            try:
                hwnd = ctypes.windll.user32.GetForegroundWindow()
                length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
                buf = ctypes.create_unicode_buffer(length + 1)
                ctypes.windll.user32.GetWindowTextW(hwnd, buf, length + 1)
                if buf.value:
                    title = buf.value
            except Exception:
                pass

        self.active_window_title = title
        lower_t = title.lower()

        if any(w in lower_t for w in ["youtube", "instagram", "whatsapp", "facebook", "twitter", "reddit", "netflix", "tiktok"]):
            self.active_app_category = "🔴 Distraction"
        elif any(w in lower_t for w in ["visual studio code", "vscode", "leetcode", "pycharm", "github", "jupyter", "notion", "pdf", "word"]):
            self.active_app_category = "🟢 Productive"
        elif any(w in lower_t for w in ["chrome", "edge", "firefox"]):
            self.active_app_category = "🟡 Browser"
        else:
            self.active_app_category = "⚪ General"

# ============================================================================
# OBJECT DETECTOR
# ============================================================================
class ObjectDetector:
    def __init__(self):
        self.yolo_model = None
        self.phone_motion_history = deque(maxlen=10)
        self.previous_phone_positions = []
        self.phone_detection_confidence = 0.0

        if HAS_YOLO:
            try:
                print("[ObjectDetector] Loading YOLOv8...")
                self.yolo_model = YOLO("yolov8n.pt")
                print("[ObjectDetector] YOLOv8 loaded.")
            except Exception as e:
                print(f"[ObjectDetector] Could not load YOLO: {e}")
                self.yolo_model = None

    def detect_objects(self, frame):
        h, w = frame.shape[:2]
        detections = {
            "phone_detected": False,
            "phone_label": "No Phone",
            "phone_position": None,
            "phone_motion": False,
            "laptop_detected": False,
            "external_monitor": False,
            "food_detected": False,
            "food_items": [],
            "drink_detected": False,
            "drink_items": [],
            "subject_detected": "None",
            "person_count": 0,
            "yolo_boxes": [],
            "phone_bbox": None
        }

        if self.yolo_model is not None:
            try:
                results = self.yolo_model(frame, verbose=False, conf=0.25)[0]
                phone_positions = []

                for box in results.boxes:
                    cls_id = int(box.cls[0])
                    name = self.yolo_model.names[cls_id].lower()
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    conf = float(box.conf[0])
                    cx = (x1 + x2) // 2
                    cy = (y1 + y2) // 2

                    detections["yolo_boxes"].append((name, conf, (x1, y1, x2, y2)))

                    if "phone" in name or "cell" in name:
                        phone_positions.append((cx, cy))
                        detections["phone_detected"] = True
                        detections["phone_bbox"] = (x1, y1, x2, y2)
                        self.phone_detection_confidence = conf

                        if y2 > h * 0.55:
                            detections["phone_label"] = f"📱 Phone in Hand ({conf:.0%})"
                        elif y1 < h * 0.3:
                            detections["phone_label"] = f"📱 Phone near Face ({conf:.0%})"
                        else:
                            detections["phone_label"] = f"📱 Phone on Desk ({conf:.0%})"

                    if "laptop" in name:
                        detections["laptop_detected"] = True
                    if "tv" in name or "monitor" in name:
                        detections["external_monitor"] = True

                    food_items = ["sandwich", "pizza", "donut", "cake", "apple", "banana", "orange", "burger"]
                    if any(f in name for f in food_items):
                        detections["food_detected"] = True
                        detections["food_items"].append(name)

                    drink_items = ["bottle", "cup", "coffee", "tea", "drink"]
                    if any(d in name for d in drink_items):
                        detections["drink_detected"] = True
                        detections["drink_items"].append(name)

                    if "person" in name:
                        detections["person_count"] += 1

                    if "book" in name:
                        detections["subject_detected"] = "📚 Book"
                    elif "keyboard" in name:
                        detections["subject_detected"] = "⌨️ Keyboard"
                    elif "mouse" in name:
                        detections["subject_detected"] = "🖱️ Mouse"

                if phone_positions:
                    self.previous_phone_positions.append(phone_positions[0])
                    if len(self.previous_phone_positions) >= 2:
                        dx = abs(self.previous_phone_positions[-1][0] - self.previous_phone_positions[-2][0])
                        dy = abs(self.previous_phone_positions[-1][1] - self.previous_phone_positions[-2][1])
                        if dx > 20 or dy > 20:
                            detections["phone_motion"] = True
                            detections["phone_label"] += " (Moving)"

            except Exception as err:
                print(f"[ObjectDetector] Error: {err}")

        return detections

# ============================================================================
# VISION PIPELINE
# ============================================================================
class VisionPipeline:
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
        self.hands = mp_hands.Hands(
            max_num_hands=2,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )

        self.blink_count = 0
        self.eye_state_closed = False
        self.blink_start_time = 0.0
        self.last_blink_duration = 0.0
        self.blink_times = deque(maxlen=60)
        self.yawn_count = 0
        self.yawn_active = False
        self.yawn_start_time = 0.0
        self.emotion_history = deque(maxlen=30)
        self.stress_level_history = deque(maxlen=30)

    def compute_ear(self, landmarks, eye_indices, w, h):
        pts = np.array([(landmarks[i].x * w, landmarks[i].y * h) for i in eye_indices])
        v1 = np.linalg.norm(pts[1] - pts[5])
        v2 = np.linalg.norm(pts[2] - pts[4])
        horiz = np.linalg.norm(pts[0] - pts[3])
        return (v1 + v2) / (2.0 * horiz + 1e-6)

    def compute_mar(self, landmarks, w, h):
        pts = np.array([(landmarks[i].x * w, landmarks[i].y * h) for i in MOUTH_INNER])
        if len(pts) < 4:
            return 0.0
        vert = np.linalg.norm(pts[0] - pts[1])
        horiz = np.linalg.norm(pts[2] - pts[3])
        return vert / (horiz + 1e-6)

    def estimate_gaze(self, landmarks, w, h):
        try:
            left_iris_center = np.mean([(landmarks[i].x * w, landmarks[i].y * h) for i in LEFT_IRIS], axis=0)
            right_iris_center = np.mean([(landmarks[i].x * w, landmarks[i].y * h) for i in RIGHT_IRIS], axis=0)

            left_corner = np.array([landmarks[33].x * w, landmarks[33].y * h])
            right_corner = np.array([landmarks[133].x * w, landmarks[133].y * h])

            eye_width = np.linalg.norm(right_corner - left_corner) + 1e-6
            relative_x = (left_iris_center[0] - left_corner[0]) / eye_width

            if relative_x < 0.35:
                return "👀 Looking Right"
            elif relative_x > 0.65:
                return "👀 Looking Left"

            top_lid = np.array([landmarks[159].x * w, landmarks[159].y * h])
            bot_lid = np.array([landmarks[145].x * w, landmarks[145].y * h])
            eye_height = np.linalg.norm(bot_lid - top_lid) + 1e-6
            relative_y = (left_iris_center[1] - top_lid[1]) / eye_height

            if relative_y < 0.30:
                return "👀 Looking Up"
            elif relative_y > 0.75:
                return "👀 Looking Down"

            return "👀 Facing Screen"
        except:
            return "👀 Gaze Unknown"

    def estimate_head_pose(self, landmarks, w, h):
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

    def classify_emotion(self, landmarks, ear, mar, w, h):
        try:
            mouth_corner_l = np.array([landmarks[61].x * w, landmarks[61].y * h])
            mouth_corner_r = np.array([landmarks[291].x * w, landmarks[291].y * h])
            upper_lip = np.array([landmarks[0].x * w, landmarks[0].y * h])
            lower_lip = np.array([landmarks[17].x * w, landmarks[17].y * h])

            eyebrow_l = np.array([landmarks[70].x * w, landmarks[70].y * h])
            eyebrow_r = np.array([landmarks[300].x * w, landmarks[300].y * h])
            eyebrow_dist = np.linalg.norm(eyebrow_l - eyebrow_r)

            mouth_center_y = (upper_lip[1] + lower_lip[1]) / 2.0
            corners_y = (mouth_corner_l[1] + mouth_corner_r[1]) / 2.0

            if mar > 0.45 and ear > 0.25:
                return "😮 Surprised"
            elif corners_y < mouth_center_y - 3 and mar > 0.15:
                return "😊 Happy"
            elif corners_y > mouth_center_y + 4:
                return "😢 Sad"
            elif eyebrow_dist < w * 0.09:
                return "😠 Angry"
            elif ear < 0.18 and mar < 0.15:
                return "😫 Tired"
            else:
                return "😐 Neutral"
        except:
            return "😐 Neutral"

    def process_frame(self, frame):
        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        now = time.time()

        res_mesh = self.face_mesh.process(rgb)
        res_pose = self.pose.process(rgb)
        res_hands = self.hands.process(rgb)

        results = {
            "face_present": False,
            "face_count": 0,
            "face_confidence": 0.0,
            "ear": 0.0,
            "mar": 0.0,
            "eyes_closed": False,
            "drowsy": False,
            "gaze": "No Face",
            "yaw": 0.0,
            "pitch": 0.0,
            "roll": 0.0,
            "head_pose_status": "No Face",
            "yawning": False,
            "emotion": "Neutral",
            "stress_level": "Low",
            "sitting_posture": "Sitting",
            "full_body_posture": "Good Posture",
            "hand_activity": "Idle Hands",
            "person_count": 0,
            "student_present": False,
            "landmarks": None,
            "blink_rate": 0
        }

        if res_mesh.multi_face_landmarks:
            results["face_count"] = len(res_mesh.multi_face_landmarks)
            results["face_present"] = True
            results["face_confidence"] = 0.95 if results["face_count"] == 1 else 0.80
            landmarks = res_mesh.multi_face_landmarks[0].landmark
            results["landmarks"] = landmarks

            ear_l = self.compute_ear(landmarks, LEFT_EYE, w, h)
            ear_r = self.compute_ear(landmarks, RIGHT_EYE, w, h)
            avg_ear = (ear_l + ear_r) / 2.0
            results["ear"] = avg_ear

            mar = self.compute_mar(landmarks, w, h)
            results["mar"] = mar

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
                    self.last_blink_duration = now - self.blink_start_time
                    self.blink_count += 1
                    self.blink_times.append(now)

            self.blink_times = deque([t for t in self.blink_times if now - t <= 60], maxlen=60)
            results["blink_rate"] = len(self.blink_times)

            if mar > 0.52:
                if not self.yawn_active:
                    self.yawn_active = True
                    self.yawn_start_time = now
                if now - self.yawn_start_time > 1.2:
                    results["yawning"] = True
                    if now - self.yawn_start_time > 2.5:
                        self.yawn_count += 1
            else:
                self.yawn_active = False

            results["gaze"] = self.estimate_gaze(landmarks, w, h)
            yaw, pitch, roll = self.estimate_head_pose(landmarks, w, h)
            results["yaw"], results["pitch"], results["roll"] = yaw, pitch, roll

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

            results["emotion"] = self.classify_emotion(landmarks, avg_ear, mar, w, h)
            self.emotion_history.append(results["emotion"])

            blink_rate = results["blink_rate"]
            if blink_rate > 28 or (abs(yaw) > 25 and results["emotion"] in ["😫 Tired", "😠 Angry"]):
                results["stress_level"] = "High"
            elif blink_rate > 18:
                results["stress_level"] = "Moderate"
            else:
                results["stress_level"] = "Low"

            self.stress_level_history.append(results["stress_level"])

        if res_pose.pose_landmarks:
            p_lm = res_pose.pose_landmarks.landmark
            results["student_present"] = True
            results["person_count"] = max(results["face_count"], 1)

            try:
                l_shoulder = p_lm[mp_pose.PoseLandmark.LEFT_SHOULDER.value]
                r_shoulder = p_lm[mp_pose.PoseLandmark.RIGHT_SHOULDER.value]
                nose = p_lm[mp_pose.PoseLandmark.NOSE.value]

                shoulder_y = (l_shoulder.y + r_shoulder.y) / 2.0
                shoulder_slope = abs(l_shoulder.y - r_shoulder.y)

                if shoulder_slope > 0.08:
                    results["full_body_posture"] = "Leaning Side"
                elif (shoulder_y - nose.y) < 0.22:
                    results["full_body_posture"] = "Slouching"
                else:
                    results["full_body_posture"] = "✅ Good Upright"

                l_hip = p_lm[mp_pose.PoseLandmark.LEFT_HIP.value]
                if l_hip.visibility > 0.5 and l_hip.y < 0.5:
                    results["sitting_posture"] = "Standing"
                else:
                    results["sitting_posture"] = "Sitting"
            except:
                pass

        if res_hands.multi_hand_landmarks:
            hand_actions = []
            for h_lm in res_hands.multi_hand_landmarks:
                pts = h_lm.landmark
                hand_y = np.mean([p.y for p in pts])
                hand_x = np.mean([p.x for p in pts])
                if hand_y > 0.70:
                    if hand_x > 0.60:
                        hand_actions.append("🖱️ Mouse")
                    else:
                        hand_actions.append("⌨️ Keyboard")
                elif hand_y < 0.45:
                    hand_actions.append("✋ Near Face")
            if hand_actions:
                results["hand_activity"] = ", ".join(list(set(hand_actions)))

        return results

# ============================================================================
# FOCUS ENGINE
# ============================================================================
class FocusEngine:
    def __init__(self):
        self.session_start_time = time.time()
        self.total_focused_time = 0.0
        self.total_distracted_time = 0.0
        self.total_break_time = 0.0
        self.last_update_time = time.time()
        self.session_state = "STARTED"
        self.pomodoro_mode = True
        self.pomodoro_phase = "STUDY_25M"
        self.pomodoro_phase_start = time.time()
        self.pomodoro_cycle_count = 0
        self.history = deque(maxlen=300)
        self.look_away_start = None
        self.active_alert = None
        self.alert_clear_time = 0.0
        self.look_away_count = 0
        self.phone_distraction_seconds = 0.0
        self.drowsy_event_count = 0
        self.focus_score_history = deque(maxlen=60)
        self.productivity_score_history = deque(maxlen=60)

    def update(self, vision_data, audio_data, activity_data, object_data, lighting_status):
        now = time.time()
        dt = min(now - self.last_update_time, 1.0)
        self.last_update_time = now

        eye_score = 100.0 if (vision_data["ear"] > 0.20 and not vision_data["eyes_closed"]) else 0.0
        head_score = 100.0 if vision_data["head_pose_status"] == "Facing Screen" else 30.0
        face_score = 100.0 if (vision_data["face_present"] and vision_data["face_count"] == 1) else 0.0
        phone_score = 0.0 if not object_data["phone_detected"] else 100.0
        posture_score = 100.0 if "Good" in vision_data["full_body_posture"] else 60.0
        activity_score = 100.0 if activity_data.get_system_idle_seconds() < 120 else 50.0
        audio_score = 100.0 if not audio_data.is_speaking else 40.0

        focus_score = (
            0.25 * eye_score +
            0.20 * head_score +
            0.15 * face_score +
            0.15 * phone_score +
            0.10 * posture_score +
            0.10 * activity_score +
            0.05 * audio_score
        )

        is_focused = focus_score >= 65.0
        self.history.append((now, focus_score))
        self.history = deque([(t, s) for t, s in self.history if now - t <= 300], maxlen=300)
        self.focus_score_history.append(focus_score)

        if self.session_state in ["STARTED", "RESUMED"]:
            if is_focused:
                self.total_focused_time += dt
            else:
                self.total_distracted_time += dt
        else:
            self.total_break_time += dt

        total_tracked = max(1.0, self.total_focused_time + self.total_distracted_time)
        focused_pct = (self.total_focused_time / total_tracked) * 100.0
        phone_pct = min(100.0, (self.phone_distraction_seconds / total_tracked) * 100.0)
        productivity_score = max(0.0, min(100.0, 0.75 * focused_pct + 0.15 * (100 - phone_pct) + 0.10 * (audio_score)))
        self.productivity_score_history.append(productivity_score)

        if vision_data["head_pose_status"] != "Facing Screen":
            if self.look_away_start is None:
                self.look_away_start = now
            elif now - self.look_away_start > 15.0:
                self.active_alert = "🚨 ALERT: Looking away > 15s!"
                self.look_away_count += 1
        else:
            self.look_away_start = None

        if object_data["phone_detected"]:
            self.active_alert = "🚨 ALERT: Phone detected!"
            self.phone_distraction_seconds += dt
        elif vision_data["drowsy"]:
            self.active_alert = "🚨 ALERT: Drowsiness detected!"
            self.drowsy_event_count += 1
        elif vision_data["face_count"] > 1:
            self.active_alert = "🚨 ALERT: Multiple people!"
        elif not vision_data["face_present"] and self.session_state == "STARTED":
            self.active_alert = "🚨 ALERT: No face detected!"

        if self.active_alert and now > self.alert_clear_time:
            self.alert_clear_time = now + 3.0

        p_elapsed = now - self.pomodoro_phase_start
        p_remaining = 0
        if self.pomodoro_phase == "STUDY_25M":
            p_remaining = max(0, 1500 - int(p_elapsed))
            if p_remaining == 0:
                self.pomodoro_cycle_count += 1
                self.pomodoro_phase = "SHORT_BREAK_5M" if self.pomodoro_cycle_count % 4 != 0 else "LONG_BREAK_15M"
                self.pomodoro_phase_start = now
        elif self.pomodoro_phase == "SHORT_BREAK_5M":
            p_remaining = max(0, 300 - int(p_elapsed))
            if p_remaining == 0:
                self.pomodoro_phase = "STUDY_25M"
                self.pomodoro_phase_start = now
        elif self.pomodoro_phase == "LONG_BREAK_15M":
            p_remaining = max(0, 900 - int(p_elapsed))
            if p_remaining == 0:
                self.pomodoro_phase = "STUDY_25M"
                self.pomodoro_phase_start = now

        return {
            "focus_score": focus_score,
            "productivity_score": productivity_score,
            "is_focused": is_focused,
            "total_study_sec": int(now - self.session_start_time),
            "focused_sec": int(self.total_focused_time),
            "distracted_sec": int(self.total_distracted_time),
            "break_sec": int(self.total_break_time),
            "pomodoro_phase": self.pomodoro_phase,
            "pomodoro_remaining": p_remaining,
            "active_alert": self.active_alert if (now < self.alert_clear_time) else None
        }

    def generate_ai_coach_advice(self, metrics):
        if metrics["focus_score"] > 85:
            return "🤖 AI Coach: Excellent concentration! Keep it up!"
        elif self.phone_distraction_seconds > 60:
            return "🤖 AI Coach: Put your phone in another room!"
        elif self.look_away_count > 5:
            return "🤖 AI Coach: Try focusing on one task at a time."
        elif self.drowsy_event_count > 2:
            return "🤖 AI Coach: Take a 5-min walk to refresh!"
        elif metrics["focus_score"] < 50:
            return "🤖 AI Coach: Take a Pomodoro break now!"
        else:
            return "🤖 AI Coach: Stay upright and focused!"

# ============================================================================
# HUD RENDERER
# ============================================================================
class FocusHUD:
    def __init__(self):
        self.font = cv2.FONT_HERSHEY_SIMPLEX

    def draw_glass_card(self, img, pt1, pt2, color=(25, 25, 35), alpha=0.65):
        x1, y1 = pt1
        x2, y2 = pt2
        overlay = img.copy()
        cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)
        cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0, img)
        cv2.rectangle(img, (x1, y1), (x2, y2), (70, 70, 90), 1)

    def render(self, frame, vision, audio, activity, objects, engine_metrics, lighting):
        h, w = frame.shape[:2]

        self.draw_glass_card(frame, (0, 0), (w, 45), (15, 15, 25), 0.80)
        cv2.putText(frame, "AI FOCUS TRACKER PRO", (15, 28), self.font, 0.7, (0, 220, 255), 2)
        cv2.putText(frame, f"Session: {engine_metrics['pomodoro_phase']}", (280, 28), self.font, 0.55, (255, 255, 255), 1)

        mins = engine_metrics["pomodoro_remaining"] // 60
        secs = engine_metrics["pomodoro_remaining"] % 60
        p_str = f"Pomodoro: {mins:02d}:{secs:02d}"
        cv2.putText(frame, p_str, (w - 230, 28), self.font, 0.6, (0, 255, 150), 2)

        self.draw_glass_card(frame, (10, 55), (310, 410), (20, 20, 30), 0.70)
        focus_color = (0, 230, 0) if engine_metrics["focus_score"] > 65 else (0, 140, 255)
        cv2.putText(frame, f"FOCUS: {engine_metrics['focus_score']:.0f}%", (20, 85), self.font, 0.7, focus_color, 2)
        cv2.putText(frame, f"Productivity: {engine_metrics['productivity_score']:.0f}%", (20, 110), self.font, 0.55, (220, 220, 220), 1)
        cv2.line(frame, (20, 120), (300, 120), (60, 60, 80), 1)

        cv2.putText(frame, f"Face: {'✅' if vision['face_present'] else '❌'}", (20, 145), self.font, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, f"Gaze: {vision['gaze']}", (20, 170), self.font, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, f"Head: {vision['head_pose_status']}", (20, 195), self.font, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, f"EAR: {vision['ear']:.2f} | MAR: {vision['mar']:.2f}", (20, 220), self.font, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, f"Emotion: {vision['emotion']}", (20, 245), self.font, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, f"Stress: {vision['stress_level']}", (20, 270), self.font, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, f"Posture: {vision['full_body_posture']}", (20, 295), self.font, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, f"Sitting: {vision['sitting_posture']}", (20, 320), self.font, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, f"Lighting: {lighting}", (20, 345), self.font, 0.5, (255, 255, 255), 1)

        self.draw_glass_card(frame, (w - 320, 55), (w - 10, 380), (20, 20, 30), 0.70)
        cv2.putText(frame, "ENVIRONMENT", (w - 310, 85), self.font, 0.55, (0, 220, 255), 2)
        cv2.line(frame, (w - 310, 95), (w - 20, 95), (60, 60, 80), 1)

        phone_color = (0, 165, 255) if objects['phone_detected'] else (255, 255, 255)
        cv2.putText(frame, f"Phone: {objects['phone_label']}", (w - 310, 120), self.font, 0.5, phone_color, 1)
        cv2.putText(frame, f"Food: {'🍔 Yes' if objects['food_detected'] else 'None'}", (w - 310, 145), self.font, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, f"Drink: {'☕ Yes' if objects['drink_detected'] else 'None'}", (w - 310, 170), self.font, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, f"Subject: {objects['subject_detected']}", (w - 310, 195), self.font, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, f"Hands: {vision['hand_activity']}", (w - 310, 220), self.font, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, f"Audio: {audio.sound_class}", (w - 310, 245), self.font, 0.5, (255, 255, 255), 1)

        app_str = f"App: {activity.active_app_category}"
        cv2.putText(frame, app_str[:32], (w - 310, 270), self.font, 0.45, (255, 255, 255), 1)

        idle_sec = activity.get_system_idle_seconds()
        cv2.putText(frame, f"Idle: {idle_sec:.0f}s", (w - 310, 295), self.font, 0.5, (255, 255, 255), 1)
        cv2.putText(frame, f"Study: {engine_metrics['focused_sec']//60}m / {engine_metrics['total_study_sec']//60}m", (w - 310, 320), self.font, 0.5, (0, 255, 150), 1)

        self.draw_glass_card(frame, (10, h - 75), (w - 10, h - 10), (15, 15, 25), 0.85)

        for name, conf, (x1, y1, x2, y2) in objects.get("yolo_boxes", []):
            is_phone = "phone" in name or "cell" in name
            box_color = (255, 0, 255) if is_phone else (0, 255, 255)
            cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)
            label = f"{name} {conf:.2f}"
            cv2.rectangle(frame, (x1, max(0, y1 - 22)), (x1 + len(label) * 10, y1), box_color, -1)
            cv2.putText(frame, label, (x1 + 3, max(14, y1 - 6)), self.font, 0.45, (0, 0, 0), 1, cv2.LINE_AA)

        if engine_metrics["active_alert"]:
            cv2.putText(frame, engine_metrics["active_alert"], (20, h - 42), self.font, 0.65, (0, 0, 255), 2)
        else:
            coach_text = "🤖 AI Coach: Stay focused and maintain good posture!"
            cv2.putText(frame, coach_text, (20, h - 42), self.font, 0.55, (255, 220, 0), 1)

        cv2.putText(frame, "[q]: Quit | [p]: Pause | [s]: Save", (20, h - 20), self.font, 0.45, (180, 180, 180), 1)

# ============================================================================
# MAIN
# ============================================================================
def evaluate_lighting(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mean_val = float(np.mean(gray))
    if mean_val < 45:
        return "🌑 Too Dark"
    elif mean_val > 215:
        return "☀️ Too Bright"
    else:
        return "✅ Good Lighting"

def save_analytics_report(engine, vision, activity, objects):
    data = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total_study_seconds": engine.total_focused_time + engine.total_distracted_time,
        "focused_seconds": engine.total_focused_time,
        "distracted_seconds": engine.total_distracted_time,
        "break_seconds": engine.total_break_time,
        "look_away_events": engine.look_away_count,
        "phone_usage_seconds": engine.phone_distraction_seconds,
        "drowsy_events": engine.drowsy_event_count,
        "blink_count": vision.blink_count,
        "yawn_count": vision.yawn_count,
        "active_app": activity.active_window_title
    }
    filename = f"focus_analytics_{int(time.time())}.json"
    with open(filename, "w") as f:
        json.dump(data, f, indent=4)
    print(f"\n[Analytics] Saved to {filename}")

def main():
    print("=" * 60)
    print("   AI FOCUS TRACKER PRO — 30-IN-1 STUDY COMPANION")
    print("=" * 60)
    print("Initializing...")

    # Test webcam first
    print("Testing webcam...")
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("❌ ERROR: Could not open webcam!")
        print("Please check:")
        print("  1. Webcam is plugged in")
        print("  2. Webcam drivers are installed")
        print("  3. No other app is using the webcam")
        print("  4. Camera permissions are granted")
        return

    # Try to set resolution
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    # Test capture
    ret, test_frame = cap.read()
    if not ret:
        print("❌ ERROR: Webcam opened but cannot capture frames!")
        cap.release()
        return

    print("✅ Webcam working!")
    cap.release()

    # Reopen for actual use
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    # Initialize components
    audio_mon = AudioMonitor()
    audio_mon.start()

    activity_mon = SystemActivityTracker()
    object_det = ObjectDetector()
    vision_pipe = VisionPipeline()
    focus_engine = FocusEngine()
    hud = FocusHUD()

    print("\n✅ All 30 AI modules active!")
    print("📸 Webcam window launching...")
    print("Press 'q' in the window to exit.")
    print("=" * 60)

    frame_count = 0
    cached_objects = {
        "phone_detected": False,
        "phone_label": "No Phone",
        "phone_position": None,
        "phone_motion": False,
        "laptop_detected": False,
        "external_monitor": False,
        "food_detected": False,
        "food_items": [],
        "drink_detected": False,
        "drink_items": [],
        "subject_detected": "None",
        "person_count": 0,
        "yolo_boxes": [],
        "phone_bbox": None
    }

    try:
        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                print("⚠️ Frame capture failed, retrying...")
                time.sleep(0.1)
                continue

            frame = cv2.flip(frame, 1)
            frame_count += 1

            lighting = evaluate_lighting(frame)

            if frame_count % 2 == 0:
                cached_objects = object_det.detect_objects(frame)
                activity_mon.update_active_app()

            vision_results = vision_pipe.process_frame(frame)

            metrics = focus_engine.update(
                vision_results,
                audio_mon,
                activity_mon,
                cached_objects,
                lighting
            )

            hud.render(
                frame,
                vision_results,
                audio_mon,
                activity_mon,
                cached_objects,
                metrics,
                lighting
            )

            cv2.imshow("AI Focus Tracker Pro", frame)

            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            elif key == ord('s'):
                save_analytics_report(focus_engine, vision_pipe, activity_mon, cached_objects)
            elif key == ord('p'):
                if focus_engine.session_state == "STARTED":
                    focus_engine.session_state = "PAUSED"
                    print("⏸️ Pomodoro Paused.")
                else:
                    focus_engine.session_state = "STARTED"
                    print("▶️ Pomodoro Resumed.")

    except KeyboardInterrupt:
        print("\n⏹️ Stopping...")
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        audio_mon.stop()
        cap.release()
        cv2.destroyAllWindows()
        save_analytics_report(focus_engine, vision_pipe, activity_mon, cached_objects)
        print("\n✅ Session complete! Focus data saved.")

if __name__ == "__main__":
    main()

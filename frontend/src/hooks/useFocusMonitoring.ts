import { useCallback, useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import { recordFocusEvent } from '../api/client';
import type { MonitoringStrictness } from '../api/types';

const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
// EfficientDet Lite is a valid MediaPipe-compatible COCO detector and runs
// locally in the browser. Its COCO labels include "cell phone".
const PHONE_MODEL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite';

// These are the browser defaults for the reference prototype. Replace with the
// prototype constants when desktop_focus_tracker_prototype.py is added.
const SETTINGS: Record<MonitoringStrictness, { awayMs: number; toleratedTabs: number; phoneImmediate: boolean }> = {
  lenient: { awayMs: 6000, toleratedTabs: 5, phoneImmediate: false },
  balanced: { awayMs: 3500, toleratedTabs: 2, phoneImmediate: true },
  strict: { awayMs: 1800, toleratedTabs: 0, phoneImmediate: true },
};

const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

interface MonitorEvent {
  type: string;
  message: string;
}

interface UseFocusMonitoringResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  monitoring: boolean;
  cameraAvailable: boolean;
  detectorStatus: string;
  monitorError: string | null;
  events: MonitorEvent[];
  warningCount: number;
  focusScore: number;
  activeWarning: string | null;
  tabSwitchCount: number;
  startMonitoring: (sessionId: number, strictness: MonitoringStrictness) => Promise<boolean>;
  stopMonitoring: () => void;
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const ear = (landmarks: { x: number; y: number }[], indices: number[]) => {
  const [p1, p2, p3, p4, p5, p6] = indices.map((index) => landmarks[index]);
  return (distance(p2, p6) + distance(p3, p5)) / (2 * distance(p1, p4));
};

export const useFocusMonitoring = (): UseFocusMonitoringResult => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceRef = useRef<FaceLandmarker | null>(null);
  const phoneRef = useRef<ObjectDetector | null>(null);
  const sessionRef = useRef<number | null>(null);
  const strictnessRef = useRef<MonitoringStrictness>('balanced');
  const frameRef = useRef<number | null>(null);
  const awaySinceRef = useRef<number | null>(null);
  const tabSwitchesRef = useRef(0);
  const warningCountRef = useRef(0);
  const cooldownRef = useRef<Record<string, number>>({});
  const [monitoring, setMonitoring] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState(false);
  const [detectorStatus, setDetectorStatus] = useState('Camera monitoring is off');
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [warningCount, setWarningCount] = useState(0);
  const [focusScore, setFocusScore] = useState(100);
  const [activeWarning, setActiveWarning] = useState<string | null>(null);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);

  const waitForVideo = async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (videoRef.current) return videoRef.current;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    return null;
  };

  const logEvent = useCallback((type: string, message: string, warn = true) => {
    const now = Date.now();
    if (now - (cooldownRef.current[type] ?? 0) < 2500) return;
    cooldownRef.current[type] = now;
    if (warn) {
      warningCountRef.current += 1;
      setWarningCount(warningCountRef.current);
      const penalties: Record<string, number> = { phone_detected: 15, away: 20, sleepy: 10, tab_switch: 5, fullscreen_exit: 5 };
      setFocusScore((score) => Math.max(0, score - (penalties[type] ?? 5)));
      setActiveWarning(message);
      window.setTimeout(() => setActiveWarning(null), 4500);
    }
    setEvents((current) => [{ type, message }, ...current].slice(0, 8));
    if (sessionRef.current !== null) {
      void recordFocusEvent(sessionRef.current, type, strictnessRef.current).catch(() => undefined);
    }
  }, []);

  const stopMonitoring = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    faceRef.current?.close();
    phoneRef.current?.close();
    faceRef.current = null;
    phoneRef.current = null;
    sessionRef.current = null;
    setMonitoring(false);
    setCameraAvailable(false);
    setDetectorStatus('Camera monitoring is off');
  }, []);

  const startMonitoring = useCallback(async (sessionId: number, strictness: MonitoringStrictness) => {
    strictnessRef.current = strictness;
    sessionRef.current = sessionId;
    setMonitorError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      const video = await waitForVideo();
      if (!video) throw new Error('Camera preview is unavailable');
      video.srcObject = stream;
      await video.play();
      setCameraAvailable(true);
      setMonitoring(true);
      setDetectorStatus('Camera active; local face analysis enabled');

      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
      faceRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
      });
      try {
        phoneRef.current = await ObjectDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: PHONE_MODEL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          maxResults: 5,
          scoreThreshold: 0.55,
        });
        setDetectorStatus('Camera and phone detection active locally');
      } catch {
        setDetectorStatus('Face monitoring active; phone model is not installed');
      }

      const scan = () => {
        const video = videoRef.current;
        const now = performance.now();
        if (video && video.readyState >= 2 && faceRef.current) {
          const result = faceRef.current.detectForVideo(video, now);
          const landmarks = result.faceLandmarks[0];
          if (!landmarks) {
            logEvent('away', 'No face detected. Please stay in camera view.');
          } else {
            const leftEar = ear(landmarks, LEFT_EYE);
            const rightEar = ear(landmarks, RIGHT_EYE);
            const averageEar = (leftEar + rightEar) / 2;
            const nose = landmarks[1];
            const leftEye = landmarks[33];
            const rightEye = landmarks[263];
            const eyeMidX = (leftEye.x + rightEye.x) / 2;
            const eyeMidY = (leftEye.y + rightEye.y) / 2;
            const eyeSpan = Math.max(0.001, Math.abs(rightEye.x - leftEye.x));
            const yaw = Math.abs((nose.x - eyeMidX) / eyeSpan);
            const pitch = (nose.y - eyeMidY) / eyeSpan;
            const lookingAway = yaw > 0.22 || Math.abs(pitch) > 0.35;
            const sleepy = averageEar < 0.19;
            if (lookingAway || sleepy) {
              awaySinceRef.current ??= Date.now();
              if (Date.now() - awaySinceRef.current >= SETTINGS[strictnessRef.current].awayMs) {
                logEvent(sleepy ? 'sleepy' : 'away', sleepy ? 'Your eyes look closed; take a moment to refocus.' : 'Please look back at your study screen.');
                awaySinceRef.current = null;
              }
            } else {
              awaySinceRef.current = null;
            }
          }
          if (phoneRef.current) {
            const detections = phoneRef.current.detectForVideo(video, now).detections;
            const phoneFound = detections.some((detection) => detection.categories.some((category) => category.categoryName === 'cell phone' || category.categoryName === 'cell_phone'));
            if (phoneFound) {
              const immediate = SETTINGS[strictnessRef.current].phoneImmediate;
              logEvent('phone_detected', immediate ? 'Phone detected in frame.' : 'Phone presence logged.', immediate);
            }
          }
        }
        frameRef.current = requestAnimationFrame(scan);
      };
      frameRef.current = requestAnimationFrame(scan);
      return true;
    } catch (error) {
      stopMonitoring();
      const message = error instanceof Error ? error.message : 'Camera or local vision setup failed';
      setMonitorError(message);
      setDetectorStatus('Monitoring unavailable; running an unmonitored session');
      return false;
    }
  }, [logEvent, stopMonitoring]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && sessionRef.current !== null) {
        tabSwitchesRef.current += 1;
        setTabSwitchCount(tabSwitchesRef.current);
        if (tabSwitchesRef.current > SETTINGS[strictnessRef.current].toleratedTabs) logEvent('tab_switch', 'You left the study tab.');
      }
    };
    const onBlur = () => {
      if (sessionRef.current !== null) tabSwitchesRef.current += 1;
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement && sessionRef.current !== null) {
        window.setTimeout(() => {
          if (!document.fullscreenElement && sessionRef.current !== null) logEvent('fullscreen_exit', 'Fullscreen was exited during the session.');
        }, 1500);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreen);
      stopMonitoring();
    };
  }, [logEvent, stopMonitoring]);

  return { videoRef, monitoring, cameraAvailable, detectorStatus, monitorError, events, warningCount, focusScore, activeWarning, tabSwitchCount, startMonitoring, stopMonitoring };
};

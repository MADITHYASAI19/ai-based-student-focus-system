import { useState, useEffect, useRef, useCallback } from 'react';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import type { Detection } from '@mediapipe/tasks-vision';

// ── Types ────────────────────────────────────────────────────────────────────

export type CameraStatus = 'idle' | 'initializing' | 'active' | 'error' | 'stopped';

export interface FaceDetectionState {
  cameraStatus: CameraStatus;
  cameraError: string | null;
  faceDetected: boolean;
  detections: Detection[];
  focusScore: number;
  trackingActive: boolean;
}

export interface UseFaceDetectionReturn extends FaceDetectionState {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  startTracking: () => Promise<void>;
  stopTracking: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DETECTION_INTERVAL_MS = 200; // Run detection ~5 fps (efficient)
const WASM_BASE_PATH = '/wasm';
const MODEL_ASSET_PATH = '/models/blaze_face_short_range.tflite';

// ── Hook ─────────────────────────────────────────────────────────────────────

export const useFaceDetection = (): UseFaceDetectionReturn => {
  // Refs for DOM elements
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Refs for internal state (avoid stale closures in loops)
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<FaceDetector | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const detectionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRunningRef = useRef(false);

  // Focus score tracking refs
  const trackingStartTimeRef = useRef<number>(0);
  const faceDetectedTimeRef = useRef<number>(0);
  const lastCheckTimeRef = useRef<number>(0);
  const lastFaceDetectedRef = useRef<boolean>(false);

  // Exposed state
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [focusScore, setFocusScore] = useState(100);
  const [trackingActive, setTrackingActive] = useState(false);

  // ── Initialize MediaPipe FaceDetector ────────────────────────────────────

  const initDetector = useCallback(async (): Promise<FaceDetector | null> => {
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE_PATH);
      const detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_PATH,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
      });
      return detector;
    } catch (err) {
      console.error('[FaceDetection] Failed to initialize detector:', err);
      // Retry with CPU delegate if GPU fails
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE_PATH);
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_ASSET_PATH,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.5,
        });
        return detector;
      } catch (cpuErr) {
        console.error('[FaceDetection] CPU fallback also failed:', cpuErr);
        return null;
      }
    }
  }, []);

  // ── Start camera stream ──────────────────────────────────────────────────

  const startCamera = useCallback(async (): Promise<boolean> => {
    // Prevent multiple streams
    if (mediaStreamRef.current) {
      console.warn('[FaceDetection] Camera already active, skipping');
      return true;
    }

    setCameraStatus('initializing');
    setCameraError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraStatus('active');
      return true;
    } catch (err: any) {
      console.error('[FaceDetection] Camera error:', err);
      let errorMessage = 'Camera access failed.';
      if (err.name === 'NotAllowedError') {
        errorMessage = 'Camera permission denied. Please allow camera access and reload.';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No camera found. Please connect a camera and try again.';
      } else if (err.name === 'NotReadableError') {
        errorMessage = 'Camera is already in use by another application.';
      }
      setCameraStatus('error');
      setCameraError(errorMessage);
      return false;
    }
  }, []);

  // ── Stop camera stream ───────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraStatus('stopped');
  }, []);

  // ── Draw bounding boxes on canvas ────────────────────────────────────────

  const drawDetections = useCallback((dets: Detection[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas size to video display size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const detection of dets) {
      const box = detection.boundingBox;
      if (!box) continue;

      const confidence = detection.categories?.[0]?.score ?? 0;

      // Draw bounding box
      ctx.strokeStyle = '#22c55e'; // green-500
      ctx.lineWidth = 3;
      ctx.strokeRect(box.originX, box.originY, box.width, box.height);

      // Draw corner accents
      const cornerLen = 15;
      ctx.strokeStyle = '#4f46e5'; // indigo-600
      ctx.lineWidth = 4;

      // Top-left
      ctx.beginPath();
      ctx.moveTo(box.originX, box.originY + cornerLen);
      ctx.lineTo(box.originX, box.originY);
      ctx.lineTo(box.originX + cornerLen, box.originY);
      ctx.stroke();

      // Top-right
      ctx.beginPath();
      ctx.moveTo(box.originX + box.width - cornerLen, box.originY);
      ctx.lineTo(box.originX + box.width, box.originY);
      ctx.lineTo(box.originX + box.width, box.originY + cornerLen);
      ctx.stroke();

      // Bottom-left
      ctx.beginPath();
      ctx.moveTo(box.originX, box.originY + box.height - cornerLen);
      ctx.lineTo(box.originX, box.originY + box.height);
      ctx.lineTo(box.originX + cornerLen, box.originY + box.height);
      ctx.stroke();

      // Bottom-right
      ctx.beginPath();
      ctx.moveTo(box.originX + box.width - cornerLen, box.originY + box.height);
      ctx.lineTo(box.originX + box.width, box.originY + box.height);
      ctx.lineTo(box.originX + box.width, box.originY + box.height - cornerLen);
      ctx.stroke();

      // Draw confidence label
      const label = `Face ${Math.round(confidence * 100)}%`;
      ctx.font = 'bold 14px Inter, system-ui, sans-serif';
      const textMetrics = ctx.measureText(label);
      const textHeight = 20;
      const padding = 6;

      ctx.fillStyle = 'rgba(79, 70, 229, 0.85)';
      ctx.fillRect(
        box.originX,
        box.originY - textHeight - padding,
        textMetrics.width + padding * 2,
        textHeight + padding
      );

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, box.originX + padding, box.originY - padding);
    }
  }, []);

  // ── Run detection on a single frame ──────────────────────────────────────

  const runDetection = useCallback(() => {
    const video = videoRef.current;
    const detector = detectorRef.current;

    if (!video || !detector || video.readyState < 2) return;

    try {
      const now = performance.now();
      const result = detector.detectForVideo(video, now);
      const hasFace = result.detections.length > 0;

      setDetections(result.detections);
      setFaceDetected(hasFace);
      drawDetections(result.detections);

      // Update focus score tracking
      const currentTime = Date.now();
      if (lastCheckTimeRef.current > 0) {
        const elapsed = currentTime - lastCheckTimeRef.current;
        if (lastFaceDetectedRef.current) {
          faceDetectedTimeRef.current += elapsed;
        }
      }
      lastCheckTimeRef.current = currentTime;
      lastFaceDetectedRef.current = hasFace;

      // Calculate focus score
      const totalTrackedTime = currentTime - trackingStartTimeRef.current;
      if (totalTrackedTime > 0) {
        const score = Math.round((faceDetectedTimeRef.current / totalTrackedTime) * 100);
        setFocusScore(Math.max(0, Math.min(100, score)));
      }
    } catch (err) {
      // detectForVideo can throw if timestamps go backward; silently ignore
      console.warn('[FaceDetection] Detection frame error:', err);
    }
  }, [drawDetections]);

  // ── Start detection loop ─────────────────────────────────────────────────

  const startDetectionLoop = useCallback(() => {
    if (detectionTimerRef.current) return;

    isRunningRef.current = true;
    detectionTimerRef.current = setInterval(() => {
      if (isRunningRef.current) {
        runDetection();
      }
    }, DETECTION_INTERVAL_MS);
  }, [runDetection]);

  // ── Stop detection loop ──────────────────────────────────────────────────

  const stopDetectionLoop = useCallback(() => {
    isRunningRef.current = false;

    if (detectionTimerRef.current) {
      clearInterval(detectionTimerRef.current);
      detectionTimerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Clear canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  // ── Public: Start tracking ───────────────────────────────────────────────

  const startTracking = useCallback(async () => {
    // 1. Start camera
    const cameraOk = await startCamera();
    if (!cameraOk) return;

    // 2. Initialize face detector
    const detector = await initDetector();
    if (!detector) {
      setCameraError('Failed to load face detection model. Please reload.');
      setCameraStatus('error');
      stopCamera();
      return;
    }
    detectorRef.current = detector;

    // 3. Reset focus score tracking
    const now = Date.now();
    trackingStartTimeRef.current = now;
    faceDetectedTimeRef.current = 0;
    lastCheckTimeRef.current = now;
    lastFaceDetectedRef.current = false;
    setFocusScore(100);
    setFaceDetected(false);
    setDetections([]);
    setTrackingActive(true);

    // 4. Wait for video to actually start playing, then start detection
    const video = videoRef.current;
    if (video) {
      const onPlaying = () => {
        startDetectionLoop();
        video.removeEventListener('playing', onPlaying);
      };
      if (video.readyState >= 2) {
        startDetectionLoop();
      } else {
        video.addEventListener('playing', onPlaying);
      }
    }
  }, [startCamera, initDetector, startDetectionLoop, stopCamera]);

  // ── Public: Stop tracking ────────────────────────────────────────────────

  const stopTracking = useCallback(() => {
    stopDetectionLoop();
    stopCamera();
    setTrackingActive(false);
    setFaceDetected(false);
    setDetections([]);

    // Close detector
    if (detectorRef.current) {
      detectorRef.current.close();
      detectorRef.current = null;
    }
  }, [stopDetectionLoop, stopCamera]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      // Stop everything on component unmount
      isRunningRef.current = false;

      if (detectionTimerRef.current) {
        clearInterval(detectionTimerRef.current);
        detectionTimerRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      if (detectorRef.current) {
        try { detectorRef.current.close(); } catch { /* ignore */ }
        detectorRef.current = null;
      }
    };
  }, []);

  return {
    videoRef,
    canvasRef,
    cameraStatus,
    cameraError,
    faceDetected,
    detections,
    focusScore,
    trackingActive,
    startTracking,
    stopTracking,
  };
};

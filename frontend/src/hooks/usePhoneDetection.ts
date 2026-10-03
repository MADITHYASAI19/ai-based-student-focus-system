import { useState, useRef, useCallback, useEffect } from 'react';
import { ObjectDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import type { BoundingBox, Detection } from '@mediapipe/tasks-vision';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PhoneDetectionState {
  phoneDetected: boolean;
  phoneConfidence: number;
  phoneBox: BoundingBox | null;
  phoneDetections: Detection[];
  phoneDetectorReady: boolean;
  phoneDetectorError: string | null;
}

export interface UsePhoneDetectionReturn extends PhoneDetectionState {
  startPhoneDetection: () => Promise<void>;
  stopPhoneDetection: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

// Throttled detection interval: ~600ms (~1.6 fps) to protect CPU/GPU performance
const PHONE_DETECTION_INTERVAL_MS = 600;
const WASM_BASE_PATH = '/wasm';
const MODEL_ASSET_PATH = '/models/efficientdet_lite0.tflite';
const PHONE_CONFIDENCE_THRESHOLD = 0.35;

// ── Hook ─────────────────────────────────────────────────────────────────────

export const usePhoneDetection = (
  videoRef: React.RefObject<HTMLVideoElement | null>
): UsePhoneDetectionReturn => {
  const detectorRef = useRef<ObjectDetector | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRunningRef = useRef<boolean>(false);

  // Debouncing / stability counters
  const consecutiveHitsRef = useRef<number>(0);
  const consecutiveMissesRef = useRef<number>(0);

  const [phoneDetected, setPhoneDetected] = useState<boolean>(false);
  const [phoneConfidence, setPhoneConfidence] = useState<number>(0);
  const [phoneBox, setPhoneBox] = useState<BoundingBox | null>(null);
  const [phoneDetections, setPhoneDetections] = useState<Detection[]>([]);
  const [phoneDetectorReady, setPhoneDetectorReady] = useState<boolean>(false);
  const [phoneDetectorError, setPhoneDetectorError] = useState<string | null>(null);

  // ── Initialize ObjectDetector ──────────────────────────────────────────────

  const initObjectDetector = useCallback(async (): Promise<ObjectDetector | null> => {
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE_PATH);
      // Try GPU first
      const detector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_PATH,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        scoreThreshold: PHONE_CONFIDENCE_THRESHOLD,
      });
      return detector;
    } catch (gpuErr) {
      console.warn('[PhoneDetection] GPU delegate failed, falling back to CPU:', gpuErr);
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE_PATH);
        const detector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_ASSET_PATH,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          scoreThreshold: PHONE_CONFIDENCE_THRESHOLD,
        });
        return detector;
      } catch (cpuErr) {
        console.error('[PhoneDetection] Failed to initialize ObjectDetector on CPU:', cpuErr);
        return null;
      }
    }
  }, []);

  // ── Run single detection frame on the shared video element ─────────────────

  const runPhoneDetection = useCallback(() => {
    const video = videoRef.current;
    const detector = detectorRef.current;

    if (!video || !detector || video.readyState < 2) return;

    try {
      const now = performance.now();
      const result = detector.detectForVideo(video, now);

      // Filter specifically for mobile phone / cell phone objects
      const phoneMatches: Detection[] = [];
      let topConfidence = 0;
      let topBox: BoundingBox | null = null;

      for (const detection of result.detections) {
        const hasPhoneCategory = detection.categories?.some((cat) => {
          const name = (cat.categoryName || '').toLowerCase();
          const score = cat.score ?? 0;
          return (
            (name.includes('cell phone') ||
              name.includes('phone') ||
              name.includes('mobile')) &&
            score >= PHONE_CONFIDENCE_THRESHOLD
          );
        });

        if (hasPhoneCategory) {
          phoneMatches.push(detection);
          const score = detection.categories?.[0]?.score ?? 0;
          if (score > topConfidence) {
            topConfidence = score;
            topBox = detection.boundingBox ?? null;
          }
        }
      }

      if (phoneMatches.length > 0) {
        consecutiveHitsRef.current += 1;
        consecutiveMissesRef.current = 0;

        // Confirm phone presence after 1-2 consecutive positive frames
        if (consecutiveHitsRef.current >= 1) {
          setPhoneDetected(true);
          setPhoneConfidence(topConfidence);
          setPhoneBox(topBox);
          setPhoneDetections(phoneMatches);
        }
      } else {
        consecutiveMissesRef.current += 1;
        consecutiveHitsRef.current = 0;

        // Clear phone state only after 2 consecutive frames without phone (avoid flickering)
        if (consecutiveMissesRef.current >= 2) {
          setPhoneDetected(false);
          setPhoneConfidence(0);
          setPhoneBox(null);
          setPhoneDetections([]);
        }
      }
    } catch (err) {
      // detectForVideo can throw if timestamps are out of order; safely ignore
      console.warn('[PhoneDetection] Frame detection error:', err);
    }
  }, [videoRef]);

  // ── Start detection loop ───────────────────────────────────────────────────

  const startLoop = useCallback(() => {
    if (timerRef.current) return;
    isRunningRef.current = true;
    timerRef.current = setInterval(() => {
      if (isRunningRef.current) {
        runPhoneDetection();
      }
    }, PHONE_DETECTION_INTERVAL_MS);
  }, [runPhoneDetection]);

  // ── Stop detection loop ────────────────────────────────────────────────────

  const stopLoop = useCallback(() => {
    isRunningRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    consecutiveHitsRef.current = 0;
    consecutiveMissesRef.current = 0;
    setPhoneDetected(false);
    setPhoneConfidence(0);
    setPhoneBox(null);
    setPhoneDetections([]);
  }, []);

  // ── Public: Start phone detection ──────────────────────────────────────────

  const startPhoneDetection = useCallback(async () => {
    setPhoneDetectorError(null);

    // Initialize detector if not yet loaded
    if (!detectorRef.current) {
      const detector = await initObjectDetector();
      if (!detector) {
        setPhoneDetectorError('Phone detection model could not be loaded.');
        return;
      }
      detectorRef.current = detector;
      setPhoneDetectorReady(true);
    }

    startLoop();
  }, [initObjectDetector, startLoop]);

  // ── Public: Stop phone detection ───────────────────────────────────────────

  const stopPhoneDetection = useCallback(() => {
    stopLoop();
    if (detectorRef.current) {
      try {
        detectorRef.current.close();
      } catch {
        /* ignore */
      }
      detectorRef.current = null;
    }
    setPhoneDetectorReady(false);
  }, [stopLoop]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      isRunningRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (detectorRef.current) {
        try {
          detectorRef.current.close();
        } catch {
          /* ignore */
        }
        detectorRef.current = null;
      }
    };
  }, []);

  return {
    phoneDetected,
    phoneConfidence,
    phoneBox,
    phoneDetections,
    phoneDetectorReady,
    phoneDetectorError,
    startPhoneDetection,
    stopPhoneDetection,
  };
};

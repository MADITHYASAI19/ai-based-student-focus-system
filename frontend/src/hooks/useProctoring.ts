import { useState, useEffect, useRef, useCallback } from 'react';
import type { Detection, BoundingBox } from '@mediapipe/tasks-vision';
import type { CameraStatus } from './useFaceDetection';
import { recordSessionFocusEvent } from '../api/client';

// ── Types ────────────────────────────────────────────────────────────────────

export type ViolationType =
  | 'NO_FACE'
  | 'FACE_DETECTED'
  | 'MULTIPLE_FACES'
  | 'LOOKING_AWAY'
  | 'PHONE_DETECTED'
  | 'PHONE_CLEARED'
  | 'CAMERA_ERROR'
  | 'CAMERA_STOPPED';

export interface ProctoringState {
  proctoringActive: boolean;
  faceStatus: 'detected' | 'not_detected';
  peopleCount: number;
  phoneStatus: 'detected' | 'not_detected';
  isLookingAway: boolean;
  activeWarning: string | null;
  activeViolationType: ViolationType | null;
  totalWarnings: number;
  activeViolations: ViolationType[];
  lastLoggedEvent: string | null;
}

export interface UseProctoringProps {
  sessionId?: number;
  isSessionActive: boolean;
  cameraStatus: CameraStatus;
  cameraError: string | null;
  faceDetected: boolean;
  faceDetections: Detection[];
  phoneDetected: boolean;
  phoneConfidence: number;
  phoneBox: BoundingBox | null;
}

// ── Grace Periods (ms) ───────────────────────────────────────────────────────

const GRACE_PERIOD_NO_FACE_MS = 2000;       // 2.0s to avoid false positive from 1 dropped frame
const GRACE_PERIOD_MULTIPLE_FACES_MS = 1200; // 1.2s to confirm 2nd face
const GRACE_PERIOD_LOOKING_AWAY_MS = 2500;   // 2.5s look-away allowance
const GRACE_PERIOD_PHONE_MS = 600;           // 0.6s to confirm phone

// ── Hook ─────────────────────────────────────────────────────────────────────

export const useProctoring = ({
  sessionId,
  isSessionActive,
  cameraStatus,
  cameraError,
  faceDetected,
  faceDetections,
  phoneDetected,
  phoneBox: _phoneBox,
}: UseProctoringProps): ProctoringState => {
  // Timestamps for grace periods
  const noFaceStartTimeRef = useRef<number | null>(null);
  const multipleFacesStartTimeRef = useRef<number | null>(null);
  const lookingAwayStartTimeRef = useRef<number | null>(null);
  const phoneStartTimeRef = useRef<number | null>(null);

  // Active violations set (current ongoing violations)
  const activeViolationsRef = useRef<Set<ViolationType>>(new Set());

  // Track state transitions to ensure we ONLY log transitions, never spam per-frame
  const loggedViolationsRef = useRef<Set<ViolationType>>(new Set());
  const lastLoggedEventRef = useRef<string | null>(null);

  // State exposed to UI
  const [activeWarning, setActiveWarning] = useState<string | null>(null);
  const [activeViolationType, setActiveViolationType] = useState<ViolationType | null>(null);
  const [activeViolationsList, setActiveViolationsList] = useState<ViolationType[]>([]);
  const [totalWarnings, setTotalWarnings] = useState<number>(0);
  const [isLookingAway, setIsLookingAway] = useState<boolean>(false);

  // ── Helper: Safe event logger to backend ─────────────────────────────────

  const logTransitionEvent = useCallback(
    async (eventType: ViolationType) => {
      lastLoggedEventRef.current = eventType;
      if (!sessionId || !isSessionActive) return;

      try {
        await recordSessionFocusEvent(sessionId, eventType);
      } catch (err) {
        console.warn(`[Proctoring] Failed to record event ${eventType}:`, err);
      }
    },
    [sessionId, isSessionActive]
  );

  // ── Look-away detector using existing BlazeFace keypoints ────────────────

  const checkLookingAway = useCallback((): boolean => {
    if (faceDetections.length !== 1) return false;
    const det = faceDetections[0];
    const keypoints = det.keypoints;

    // BlazeFace provides 6 keypoints: [0: rightEye, 1: leftEye, 2: noseTip, ...]
    if (!keypoints || keypoints.length < 3) return false;

    const rightEye = keypoints[0];
    const leftEye = keypoints[1];
    const nose = keypoints[2];

    const eyeDist = Math.abs(leftEye.x - rightEye.x);
    if (eyeDist < 0.02) return false;

    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    // Yaw ratio: offset of nose from the midpoint between both eyes
    const yawRatio = (nose.x - eyeMidX) / eyeDist;

    // If nose is shifted significantly to either side, user is turned away
    return Math.abs(yawRatio) > 0.35;
  }, [faceDetections]);

  // ── Main Proctoring Evaluation Loop (runs when inputs change) ────────────

  useEffect(() => {
    if (!isSessionActive) {
      // Clear all active violations when session is inactive
      if (activeViolationsRef.current.size > 0) {
        activeViolationsRef.current.clear();
        loggedViolationsRef.current.clear();
        setActiveWarning(null);
        setActiveViolationType(null);
        setActiveViolationsList([]);
      }
      return;
    }

    const now = Date.now();
    const currentViolations = new Set<ViolationType>();

    // 1. Camera Error
    if (cameraStatus === 'error') {
      currentViolations.add('CAMERA_ERROR');
    }

    // 2. Face Monitoring (NO_FACE, MULTIPLE_FACES)
    const peopleCount = faceDetections.length;

    if (!faceDetected || peopleCount === 0) {
      if (noFaceStartTimeRef.current === null) {
        noFaceStartTimeRef.current = now;
      } else if (now - noFaceStartTimeRef.current >= GRACE_PERIOD_NO_FACE_MS) {
        currentViolations.add('NO_FACE');
      }
    } else {
      // Face is present: reset no-face timer
      if (noFaceStartTimeRef.current !== null) {
        noFaceStartTimeRef.current = null;
        // If we previously had NO_FACE logged, record FACE_DETECTED transition
        if (loggedViolationsRef.current.has('NO_FACE')) {
          loggedViolationsRef.current.delete('NO_FACE');
          logTransitionEvent('FACE_DETECTED');
        }
      }

      // Check Multiple Faces
      if (peopleCount > 1) {
        if (multipleFacesStartTimeRef.current === null) {
          multipleFacesStartTimeRef.current = now;
        } else if (now - multipleFacesStartTimeRef.current >= GRACE_PERIOD_MULTIPLE_FACES_MS) {
          currentViolations.add('MULTIPLE_FACES');
        }
      } else {
        multipleFacesStartTimeRef.current = null;
        loggedViolationsRef.current.delete('MULTIPLE_FACES');
      }

      // Check Looking Away
      const lookingAwayNow = checkLookingAway();
      setIsLookingAway(lookingAwayNow);

      if (lookingAwayNow && peopleCount === 1) {
        if (lookingAwayStartTimeRef.current === null) {
          lookingAwayStartTimeRef.current = now;
        } else if (now - lookingAwayStartTimeRef.current >= GRACE_PERIOD_LOOKING_AWAY_MS) {
          currentViolations.add('LOOKING_AWAY');
        }
      } else {
        lookingAwayStartTimeRef.current = null;
        loggedViolationsRef.current.delete('LOOKING_AWAY');
      }
    }

    // 3. Phone Detection
    if (phoneDetected) {
      if (phoneStartTimeRef.current === null) {
        phoneStartTimeRef.current = now;
      } else if (now - phoneStartTimeRef.current >= GRACE_PERIOD_PHONE_MS) {
        currentViolations.add('PHONE_DETECTED');
      }
    } else {
      phoneStartTimeRef.current = null;
      // If phone was previously active and now cleared, log PHONE_CLEARED
      if (loggedViolationsRef.current.has('PHONE_DETECTED')) {
        loggedViolationsRef.current.delete('PHONE_DETECTED');
        logTransitionEvent('PHONE_CLEARED');
      }
    }

    // 4. Update violation counts & log state transitions
    currentViolations.forEach((v) => {
      if (!loggedViolationsRef.current.has(v)) {
        loggedViolationsRef.current.add(v);
        setTotalWarnings((prev) => prev + 1);
        logTransitionEvent(v);
      }
    });

    activeViolationsRef.current = currentViolations;
    const violationsArray = Array.from(currentViolations);
    setActiveViolationsList(violationsArray);

    // 5. Prioritize active warning message
    if (currentViolations.has('PHONE_DETECTED')) {
      setActiveWarning('⚠ Mobile phone detected');
      setActiveViolationType('PHONE_DETECTED');
    } else if (currentViolations.has('MULTIPLE_FACES')) {
      setActiveWarning('⚠ Multiple faces detected');
      setActiveViolationType('MULTIPLE_FACES');
    } else if (currentViolations.has('NO_FACE')) {
      setActiveWarning('⚠ Face not detected');
      setActiveViolationType('NO_FACE');
    } else if (currentViolations.has('LOOKING_AWAY')) {
      setActiveWarning('⚠ Looking away from screen');
      setActiveViolationType('LOOKING_AWAY');
    } else if (currentViolations.has('CAMERA_ERROR')) {
      setActiveWarning(`⚠ Camera error: ${cameraError || 'Camera unavailable'}`);
      setActiveViolationType('CAMERA_ERROR');
    } else {
      setActiveWarning(null);
      setActiveViolationType(null);
    }
  }, [
    isSessionActive,
    cameraStatus,
    cameraError,
    faceDetected,
    faceDetections,
    phoneDetected,
    checkLookingAway,
    logTransitionEvent,
  ]);

  // Log CAMERA_STOPPED when session ends
  useEffect(() => {
    if (!isSessionActive && lastLoggedEventRef.current && lastLoggedEventRef.current !== 'CAMERA_STOPPED') {
      logTransitionEvent('CAMERA_STOPPED');
    }
  }, [isSessionActive, logTransitionEvent]);

  return {
    proctoringActive: isSessionActive && cameraStatus === 'active',
    faceStatus: faceDetected ? 'detected' : 'not_detected',
    peopleCount: faceDetections.length,
    phoneStatus: phoneDetected ? 'detected' : 'not_detected',
    isLookingAway,
    activeWarning,
    activeViolationType,
    totalWarnings,
    activeViolations: activeViolationsList,
    lastLoggedEvent: lastLoggedEventRef.current,
  };
};

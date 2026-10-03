import React from 'react';
import type { BoundingBox } from '@mediapipe/tasks-vision';
import type { CameraStatus } from '../hooks/useFaceDetection';
import type { ViolationType } from '../hooks/useProctoring';

interface FocusTrackerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  cameraStatus: CameraStatus;
  cameraError: string | null;
  faceDetected: boolean;
  focusScore: number;
  trackingActive: boolean;
  // Extended proctoring props (optional for backward compatibility)
  proctoringActive?: boolean;
  peopleCount?: number;
  phoneDetected?: boolean;
  phoneConfidence?: number;
  phoneBox?: BoundingBox | null;
  activeWarning?: string | null;
  activeViolationType?: ViolationType | null;
  totalWarnings?: number;
  isLookingAway?: boolean;
}

export const FocusTracker: React.FC<FocusTrackerProps> = ({
  videoRef,
  canvasRef,
  cameraStatus,
  cameraError,
  faceDetected,
  focusScore,
  trackingActive,
  proctoringActive = false,
  peopleCount = faceDetected ? 1 : 0,
  phoneDetected = false,
  phoneConfidence = 0,
  phoneBox = null,
  activeWarning = null,
  activeViolationType = null,
  totalWarnings = 0,
  isLookingAway = false,
}) => {
  // ── Helper: score color ──────────────────────────────────────────────────

  const getScoreColor = (score: number) => {
    if (score >= 80) return { text: 'text-emerald-600', bg: 'bg-emerald-500', ring: 'ring-emerald-500/20' };
    if (score >= 50) return { text: 'text-amber-600', bg: 'bg-amber-500', ring: 'ring-amber-500/20' };
    return { text: 'text-rose-600', bg: 'bg-rose-500', ring: 'ring-rose-500/20' };
  };

  const scoreColors = getScoreColor(focusScore);

  // ── Helper: camera status display ────────────────────────────────────────

  const getCameraStatusDisplay = () => {
    switch (cameraStatus) {
      case 'idle':
        return { label: 'Ready', color: 'text-slate-400', dot: 'bg-slate-400' };
      case 'initializing':
        return { label: 'Initializing...', color: 'text-amber-500', dot: 'bg-amber-500 animate-pulse' };
      case 'active':
        return { label: 'Active', color: 'text-emerald-600', dot: 'bg-emerald-500' };
      case 'error':
        return { label: 'Error', color: 'text-rose-600', dot: 'bg-rose-500' };
      case 'stopped':
        return { label: 'Stopped', color: 'text-slate-500', dot: 'bg-slate-400' };
      default:
        return { label: 'Unknown', color: 'text-slate-400', dot: 'bg-slate-400' };
    }
  };

  const camStatus = getCameraStatusDisplay();

  // Video element dimensions for bounding box scaling
  const videoWidth = videoRef.current?.videoWidth || 640;
  const videoHeight = videoRef.current?.videoHeight || 480;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-indigo-50/80 to-slate-50/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-indigo-700">Focus Tracker</p>
            <p className="text-[10px] text-slate-500">Live face detection & proctored monitoring</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/70 border border-slate-200/80 text-[10px]">
            <span className={`w-1.5 h-1.5 rounded-full ${camStatus.dot}`} />
            <span className={`font-semibold ${camStatus.color}`}>{camStatus.label}</span>
          </div>
          {proctoringActive ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-[10px] font-black text-rose-700 uppercase tracking-wider animate-pulse">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              🔴 Proctoring Active
            </span>
          ) : trackingActive ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              Live
            </span>
          ) : null}
        </div>
      </div>

      {/* Video area */}
      <div className="relative bg-slate-900 aspect-video overflow-hidden">
        {/* Video element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />

        {/* Canvas overlay for face bounding boxes */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ transform: 'scaleX(-1)' }}
        />

        {/* Mirrored Phone Bounding Box overlay */}
        {phoneDetected && phoneBox && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ transform: 'scaleX(-1)' }}
          >
            <div
              className="absolute border-2 border-amber-400 bg-amber-500/20 rounded transition-all duration-200 shadow-lg"
              style={{
                left: `${(phoneBox.originX / videoWidth) * 100}%`,
                top: `${(phoneBox.originY / videoHeight) * 100}%`,
                width: `${(phoneBox.width / videoWidth) * 100}%`,
                height: `${(phoneBox.height / videoHeight) * 100}%`,
              }}
            >
              <span className="absolute -top-6 left-0 px-2 py-0.5 rounded bg-amber-500 text-white font-black text-[10px] whitespace-nowrap shadow-sm">
                📱 Phone {Math.round(phoneConfidence * 100)}%
              </span>
            </div>
          </div>
        )}

        {/* Top Active Warning Banner */}
        {activeWarning && (
          <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between p-2.5 rounded-xl bg-rose-600/95 text-white shadow-xl backdrop-blur-md border border-rose-400/50 animate-bounce-short">
            <div className="flex items-center gap-2">
              <span className="text-base font-black animate-pulse">⚠</span>
              <span className="text-xs font-black tracking-wide">{activeWarning}</span>
            </div>
            <span className="text-[10px] uppercase font-black bg-white/20 px-2 py-0.5 rounded">
              Violation
            </span>
          </div>
        )}

        {/* Camera status overlays */}
        {cameraStatus === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mb-4 border border-slate-700">
              <svg className="w-8 h-8 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-400">Camera will activate when session starts</p>
          </div>
        )}

        {cameraStatus === 'initializing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90">
            <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
            <p className="text-sm font-semibold text-slate-300">Initializing camera & proctoring models...</p>
            <p className="text-xs text-slate-500 mt-1">Please allow camera access if prompted</p>
          </div>
        )}

        {cameraStatus === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 px-6">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/20 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-rose-500" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-rose-400 text-center">{cameraError || 'Camera error'}</p>
          </div>
        )}

        {cameraStatus === 'stopped' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center mb-4 border border-slate-700">
              <svg className="w-7 h-7 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M12 18.75H4.5a2.25 2.25 0 01-2.25-2.25V9m12.841 9.091L16.5 19.5m-1.409-1.409c.739-.739 1.409-2.025 1.409-3.341 0-2.485-2.015-4.5-4.5-4.5s-4.5 2.015-4.5 4.5 2.015 4.5 4.5 4.5c1.316 0 2.602-.67 3.341-1.409z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-400">Camera stopped</p>
            <p className="text-xs text-slate-500 mt-1">Session ended</p>
          </div>
        )}

        {/* HUD Pills Overlay (bottom overlay when camera active) */}
        {cameraStatus === 'active' && trackingActive && (
          <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1.5 flex-wrap">
            {/* Face status */}
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold shadow-md backdrop-blur-md ${
                faceDetected ? 'bg-emerald-500/90 text-white' : 'bg-rose-500/90 text-white'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${faceDetected ? 'bg-white animate-pulse' : 'bg-white/60'}`} />
              {faceDetected ? 'Face Detected' : 'No Face'}
            </span>

            {/* People count */}
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold shadow-md backdrop-blur-md ${
                peopleCount === 1
                  ? 'bg-slate-800/85 text-slate-200'
                  : peopleCount > 1
                  ? 'bg-rose-600/90 text-white'
                  : 'bg-slate-800/85 text-slate-400'
              }`}
            >
              👥 People: {peopleCount}
            </span>

            {/* Phone status */}
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold shadow-md backdrop-blur-md ${
                phoneDetected ? 'bg-rose-500/90 text-white animate-pulse' : 'bg-slate-800/85 text-slate-200'
              }`}
            >
              📱 {phoneDetected ? 'Phone Detected' : 'No Phone'}
            </span>

            {/* Gaze / Look status */}
            {faceDetected && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold shadow-md backdrop-blur-md ${
                  isLookingAway ? 'bg-amber-500/90 text-white' : 'bg-slate-800/85 text-slate-200'
                }`}
              >
                {isLookingAway ? '👀 Looking Away' : '👀 Forward'}
              </span>
            )}

            {/* Warnings badge */}
            <span
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold shadow-md backdrop-blur-md ${
                totalWarnings > 0 ? 'bg-amber-500/90 text-white' : 'bg-slate-800/85 text-slate-300'
              }`}
            >
              ⚠ Warnings: {totalWarnings}
            </span>
          </div>
        )}
      </div>

      {/* Status panel */}
      {trackingActive && (
        <div className="px-5 py-4 space-y-4">
          {/* Basic Focus Score (EXACT existing implementation preserved) */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Basic Focus Score</span>
              <span className="text-[10px] text-slate-400">Based on face attendance over session time</span>
            </div>
            <span className={`text-2xl font-black ${scoreColors.text}`}>{focusScore}%</span>
          </div>

          {/* Score bar */}
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${scoreColors.bg}`}
              style={{ width: `${focusScore}%` }}
            />
          </div>

          {/* Proctoring Status Grid */}
          <div className="grid grid-cols-4 gap-2">
            {/* 1. Face */}
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-center">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Face</p>
              <div className={`flex items-center justify-center gap-1 ${faceDetected ? 'text-emerald-600' : 'text-rose-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${faceDetected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="text-[11px] font-bold">{faceDetected ? 'Detected' : 'None'}</span>
              </div>
            </div>

            {/* 2. People */}
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-center">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">People</p>
              <div className={`flex items-center justify-center gap-1 ${peopleCount === 1 ? 'text-emerald-600' : 'text-rose-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${peopleCount === 1 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="text-[11px] font-bold">{peopleCount}</span>
              </div>
            </div>

            {/* 3. Phone */}
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-center">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Phone</p>
              <div className={`flex items-center justify-center gap-1 ${!phoneDetected ? 'text-emerald-600' : 'text-rose-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${!phoneDetected ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                <span className="text-[11px] font-bold">{phoneDetected ? 'Detected' : 'Clear'}</span>
              </div>
            </div>

            {/* 4. Warnings */}
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-center">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">Warnings</p>
              <div className={`flex items-center justify-center gap-1 ${totalWarnings === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${totalWarnings === 0 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                <span className="text-[11px] font-bold">{totalWarnings}</span>
              </div>
            </div>
          </div>

          {/* Active warning message callout */}
          {activeWarning && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2 animate-fadeIn">
              <span className="text-sm font-bold mt-0.5">⚠</span>
              <div>
                <p className="font-extrabold">{activeWarning}</p>
                <p className="text-[11px] text-rose-600 mt-0.5">
                  {activeViolationType === 'PHONE_DETECTED' && 'Please put your mobile device away to maintain session integrity.'}
                  {activeViolationType === 'MULTIPLE_FACES' && 'Multiple people detected in view. Ensure you are studying alone.'}
                  {activeViolationType === 'NO_FACE' && 'Face missing from camera view. Please remain in front of the screen.'}
                  {activeViolationType === 'LOOKING_AWAY' && 'Please keep your eyes focused on the study material on screen.'}
                  {activeViolationType === 'CAMERA_ERROR' && 'Camera feed interrupted. Please check your camera connection.'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import React from 'react';
import type { CameraStatus } from '../hooks/useFaceDetection';

interface FocusTrackerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  cameraStatus: CameraStatus;
  cameraError: string | null;
  faceDetected: boolean;
  focusScore: number;
  trackingActive: boolean;
}

export const FocusTracker: React.FC<FocusTrackerProps> = ({
  videoRef,
  canvasRef,
  cameraStatus,
  cameraError,
  faceDetected,
  focusScore,
  trackingActive,
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
            <p className="text-[10px] text-slate-500">Live face detection & focus scoring</p>
          </div>
        </div>
        {trackingActive && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            Live
          </span>
        )}
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

        {/* Canvas overlay for bounding boxes */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ transform: 'scaleX(-1)' }}
        />

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
            <p className="text-sm font-semibold text-slate-300">Initializing camera & face detection...</p>
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

        {/* Face status indicator (bottom overlay when camera active) */}
        {cameraStatus === 'active' && trackingActive && (
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold shadow-lg backdrop-blur-md ${
              faceDetected
                ? 'bg-emerald-500/90 text-white'
                : 'bg-rose-500/90 text-white'
            }`}>
              <span className={`w-2 h-2 rounded-full ${faceDetected ? 'bg-white animate-pulse' : 'bg-white/60'}`} />
              {faceDetected ? 'Face Detected' : 'No Face Detected'}
            </span>
          </div>
        )}
      </div>

      {/* Status panel */}
      {trackingActive && (
        <div className="px-5 py-4 space-y-4">
          {/* Focus Score */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Basic Focus Score</span>
            <span className={`text-2xl font-black ${scoreColors.text}`}>{focusScore}%</span>
          </div>

          {/* Score bar */}
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${scoreColors.bg}`}
              style={{ width: `${focusScore}%` }}
            />
          </div>

          {/* Status grid */}
          <div className="grid grid-cols-3 gap-3">
            {/* Camera status */}
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Camera</p>
              <div className={`flex items-center justify-center gap-1.5 ${camStatus.color}`}>
                <span className={`w-2 h-2 rounded-full ${camStatus.dot}`} />
                <span className="text-xs font-bold">{camStatus.label}</span>
              </div>
            </div>

            {/* Face status */}
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Face</p>
              <div className={`flex items-center justify-center gap-1.5 ${faceDetected ? 'text-emerald-600' : 'text-rose-500'}`}>
                <span className={`w-2 h-2 rounded-full ${faceDetected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="text-xs font-bold">{faceDetected ? 'Detected' : 'Not Detected'}</span>
              </div>
            </div>

            {/* Tracking status */}
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Tracking</p>
              <div className={`flex items-center justify-center gap-1.5 ${trackingActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                <span className={`w-2 h-2 rounded-full ${trackingActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                <span className="text-xs font-bold">{trackingActive ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

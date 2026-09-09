import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { usePlan } from '../hooks/usePlan';
import { useFocusMonitoring } from '../hooks/useFocusMonitoring';
import type { MonitoringStrictness } from '../api/types';

export const SessionPage: React.FC = () => {
  const { session, loading, error, elapsedTime, formatTime, startSession, endSession } = useSession();
  const { plan } = usePlan();
  const [selectedPlanItemId, setSelectedPlanItemId] = useState<number | undefined>(undefined);
  const [showConsent, setShowConsent] = useState(false);
  const [strictness, setStrictness] = useState<MonitoringStrictness>('balanced');
  const [monitoringRequested, setMonitoringRequested] = useState(true);
  const [focusPanelOpen, setFocusPanelOpen] = useState(true);
  const { videoRef, monitoring, detectorStatus, monitorError, events, warningCount, focusScore, activeWarning, tabSwitchCount, startMonitoring, stopMonitoring } = useFocusMonitoring();
  const navigate = useNavigate();

  const handleStart = () => {
    setShowConsent(true);
  };

  const beginSession = async (withMonitoring: boolean) => {
    setShowConsent(false);
    try {
      if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen().catch(() => undefined);
      const started = await startSession({ plan_item_id: selectedPlanItemId });
      if (withMonitoring) await startMonitoring(started.id, strictness);
    } catch (err) {
      console.error('Failed to start session:', err);
    }
  };

  const handleEnd = async () => {
    if (!session) return;
    try {
      await endSession(session.id);
      stopMonitoring();
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    } catch (err) {
      console.error('Failed to end session:', err);
    }
  };

  const isSessionActive = session && !session.ended_at;
  const isSessionEnded = session && session.ended_at;

  const planItems = plan?.items || [];

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Focus Tracking Session
        </h1>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Track uninterrupted study time and calculate productivity & focus metrics.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm text-center">
          {error}
        </div>
      )}

      {showConsent && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Before you begin</p>
              <h2 className="text-2xl font-extrabold text-slate-900 mt-2">Choose your focus mode</h2>
              <p className="text-sm text-slate-500 mt-2">Monitoring runs on this device only. No camera video is uploaded; only focus events and the final score are saved.</p>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Strictness</label>
              <div className="grid grid-cols-3 gap-2">
                {(['lenient', 'balanced', 'strict'] as MonitoringStrictness[]).map((level) => (
                  <button key={level} type="button" onClick={() => setStrictness(level)} className={`px-3 py-2.5 rounded-xl border text-xs font-bold capitalize ${strictness === level ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 cursor-pointer">
              <input type="checkbox" checked={monitoringRequested} onChange={(event) => setMonitoringRequested(event.target.checked)} className="mt-1" />
              <span><strong className="block text-sm text-slate-800">Allow camera for this session</strong><span className="block text-xs text-slate-500 mt-1">Face attention, drowsiness, and local phone detection are enabled only for this session.</span></span>
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <button type="button" onClick={() => void beginSession(false)} className="flex-1 px-4 py-3 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold">Start unmonitored</button>
              <button type="button" onClick={() => void beginSession(monitoringRequested)} className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold">Start session</button>
            </div>
          </div>
        </div>
      )}

      {isSessionActive && activeWarning && (
        <div className="fixed inset-x-4 top-5 z-[70] mx-auto max-w-2xl rounded-2xl border-4 border-amber-400 bg-amber-50 px-5 py-4 text-amber-950 shadow-2xl" role="alert">
          <div className="flex items-start gap-3">
            <span className="text-2xl font-black text-amber-600">!</span>
            <div>
              <p className="text-sm font-extrabold uppercase tracking-wide">Focus warning</p>
              <p className="mt-1 text-base font-bold">{activeWarning}</p>
              <p className="mt-1 text-xs">Warning {warningCount} this session. Refocus when ready.</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Focus Console */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-200/50 p-8 sm:p-12 text-center transition-all">
        {/* Timer Display */}
        <div className="relative inline-flex flex-col items-center justify-center mb-8">
          <div className="w-52 h-52 sm:w-60 sm:h-60 rounded-full border-8 border-indigo-50 flex flex-col items-center justify-center relative bg-gradient-to-b from-slate-50 to-white shadow-inner">
            {isSessionActive && (
              <div className="absolute inset-0 rounded-full border-8 border-indigo-500 border-t-transparent animate-spin duration-3000"></div>
            )}
            <span className="text-5xl sm:text-6xl font-black text-slate-900 tracking-tight font-mono">
              {formatTime(elapsedTime)}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 mt-2">
              {isSessionActive ? 'Active Focus Time' : isSessionEnded ? 'Session Completed' : 'Ready to Focus'}
            </span>
          </div>
        </div>

        {/* State 1: Before Session Start */}
        {!session && (
          <div className="max-w-md mx-auto space-y-6">
            <div className="text-left">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Assign to Study Plan Item (Optional)
              </label>
              <select
                value={selectedPlanItemId ?? ''}
                onChange={(e) => setSelectedPlanItemId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">General Study Session (No specific item)</option>
                {planItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.topic_name || `Topic #${item.topic_id}`} ({item.duration_minutes} mins)
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleStart}
              disabled={loading}
              className="w-full py-4 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base shadow-lg shadow-indigo-600/25 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Starting...</span>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Start Focus Session
                </>
              )}
            </button>
          </div>
        )}

        {/* State 2: Session Active */}
        {isSessionActive && (
          <div className="max-w-md mx-auto space-y-6">
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
              Session #{session.id} in progress • Stay focused!
            </div>

            <button
              onClick={handleEnd}
              disabled={loading}
              className="w-full py-3.5 px-6 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-lg shadow-rose-600/25 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Ending & Calculating Score...</span>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                  Complete & Calculate Focus Score
                </>
              )}
            </button>
          </div>
        )}

        {/* State 3: Session Ended with Results */}
        {isSessionEnded && (
          <div className="max-w-md mx-auto space-y-6 animate-in fade-in">
            <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/20">
                ✓
              </div>
              <h3 className="text-xl font-bold text-slate-900">Session Completed!</h3>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 bg-white/80 rounded-xl border border-emerald-100">
                  <p className="text-[11px] font-semibold uppercase text-slate-400">Focus Score</p>
                  <p className="text-2xl font-black text-emerald-600">
                    {session.focus_score !== null ? `${Math.round(session.focus_score)}%` : '100%'}
                  </p>
                </div>
                <div className="p-3 bg-white/80 rounded-xl border border-emerald-100">
                  <p className="text-[11px] font-semibold uppercase text-slate-400">Productivity</p>
                  <p className="text-2xl font-black text-teal-600">
                    {session.productivity_score !== null ? `${Math.round(session.productivity_score)}%` : '100%'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => navigate('/quiz')}
                className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
              >
                Test Knowledge on Quiz →
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all cursor-pointer"
              >
                New Session
              </button>
            </div>
          </div>
        )}
      </div>

      {isSessionActive && (
        <aside className="fixed bottom-5 right-5 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-950 text-white shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <button type="button" onClick={() => setFocusPanelOpen((open) => !open)} className="flex items-center gap-2 text-left">
              <span className={`h-2.5 w-2.5 rounded-full ${focusScore >= 70 ? 'bg-emerald-400' : focusScore >= 40 ? 'bg-amber-400' : 'bg-rose-400'}`} />
              <span className="text-sm font-extrabold">Focus Mode</span>
            </button>
            <span className="text-2xl font-black">{focusScore}%</span>
          </div>
          {focusPanelOpen && (
            <div className="space-y-3 p-3">
              <video ref={videoRef} muted playsInline className={`aspect-video w-full rounded-xl bg-black object-cover ${monitoring ? '' : 'hidden'}`} />
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-white/10 px-3 py-2"><span className="block text-slate-400">Warnings</span><strong>{warningCount}</strong></div>
                <div className="rounded-lg bg-white/10 px-3 py-2"><span className="block text-slate-400">Tab switches</span><strong>{tabSwitchCount}</strong></div>
              </div>
              <p className="text-[11px] text-slate-300">{detectorStatus}. Video stays on this device.</p>
              {monitorError && <p className="rounded-lg bg-rose-400/15 p-2 text-[11px] text-rose-200">{monitorError}</p>}
              {events.length > 0 && <div className="max-h-24 space-y-1 overflow-auto rounded-lg bg-amber-400/10 p-2 text-[11px] text-amber-100">{events.map((event, index) => <p key={`${event.type}-${index}`}>{event.message}</p>)}</div>}
            </div>
          )}
        </aside>
      )}
    </div>
  );
};

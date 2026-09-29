import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { useAuth } from '../contexts/AuthContext';
import {
  explainTopic,
  getAllPlans,
  getSessionHistory,
  updatePlanItemStatus,
  getActivePlan,
} from '../api/client';
import { useFocusMonitoring } from '../hooks/useFocusMonitoring';
import type { MonitoringStrictness, StudyPlanOut, StudySessionOut } from '../api/types';

// ── Explanation renderer ─────────────────────────────────────────────────────
const ExplanationContent: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(?=^## )/m);
  return (
    <div className="space-y-5 text-left">
      {parts.map((part, i) => {
        const lines = part.split('\n');
        const heading = lines[0].replace(/^#+\s*/, '');
        const body = lines.slice(1).join('\n').trim();
        return (
          <div key={i} className="space-y-2">
            {heading && (
              <h3 className="text-sm font-extrabold text-indigo-700 uppercase tracking-wider border-b border-indigo-100 pb-1">
                {heading}
              </h3>
            )}
            <div className="text-sm leading-7 text-slate-700 whitespace-pre-wrap">{body}</div>
          </div>
        );
      })}
    </div>
  );
};

// ── Main SessionPage ─────────────────────────────────────────────────────────
export const SessionPage: React.FC = () => {
  const { session, loading, error, elapsedTime, formatTime, startSession, endSession } = useSession();
  const { userState, refreshUserState } = useAuth();
  const navigate = useNavigate();

  // Plans & topics
  const [plans, setPlans] = useState<StudyPlanOut[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<number | undefined>();
  const [selectedPlanItemId, setSelectedPlanItemId] = useState<number | undefined>();

  // Topic explanation
  const [explanationMode, setExplanationMode] = useState<'child' | 'average' | 'topper'>('average');
  const [explanation, setExplanation] = useState('');
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState('');

  // Session setup
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [showConsent, setShowConsent] = useState(false);
  const [strictness, setStrictness] = useState<MonitoringStrictness>('balanced');
  const [monitoringRequested, setMonitoringRequested] = useState(true);
  const [focusPanelOpen, setFocusPanelOpen] = useState(true);

  // Session history
  const [history, setHistory] = useState<StudySessionOut[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Marking done / updating
  const [markingDone, setMarkingDone] = useState(false);

  const {
    videoRef, monitoring, detectorStatus, monitorError, events,
    warningCount, focusScore, activeWarning, tabSwitchCount,
    startMonitoring, stopMonitoring,
  } = useFocusMonitoring();

  // ── Load plans on mount ────────────────────────────────────────────────────
  useEffect(() => {
    setPlansLoading(true);
    getAllPlans()
      .then((items) => {
        setPlans(items);
        
        // Prioritize active plan from user state
        const activePlan = userState?.active_plan || items[0];
        if (activePlan) {
          setSelectedPlanId(activePlan.id);
          // Auto-select first pending item
          const firstPending = activePlan.items.find((item) => item.status === 'pending') ?? activePlan.items[0];
          if (firstPending) {
            setSelectedPlanItemId(firstPending.id);
            setDurationMinutes(firstPending.duration_minutes || 45);
          }
        }
        setPlansError('');
      })
      .catch((err) => {
        console.error('Failed to load study plans:', err);
        setPlansError('Study plans could not be loaded. Please refresh and try again.');
      })
      .finally(() => setPlansLoading(false));
  }, [userState?.active_plan]);

  // ── Load session history ───────────────────────────────────────────────────
  useEffect(() => {
    setHistoryLoading(true);
    getSessionHistory()
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  // ── Derive selected plan and item ─────────────────────────────────────────
  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const planItems = selectedPlan?.items || [];
  const selectedItem = planItems.find((item) => item.id === selectedPlanItemId);

  // ── Generate topic explanation when item changes ───────────────────────────
  useEffect(() => {
    if (!selectedItem?.topic_name) return;
    setExplanationLoading(true);
    setExplanation('');
    setExplanationError('');
    explainTopic({ topic_name: selectedItem.topic_name, mode: explanationMode })
      .then((res) => setExplanation(res.explanation))
      .catch(() => setExplanationError('Could not generate explanation. The AI may be busy — try again.'))
      .finally(() => setExplanationLoading(false));
  }, [selectedItem?.id, explanationMode]);

  // ── Session actions ────────────────────────────────────────────────────────
  const handleStart = () => setShowConsent(true);

  const beginSession = async (withMonitoring: boolean) => {
    setShowConsent(false);
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => undefined);
      }
      const started = await startSession({
        plan_item_id: selectedPlanItemId,
        explanation_mode: explanationMode,
        duration_minutes: durationMinutes,
      });
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
      // Refresh history
      getSessionHistory().then(setHistory).catch(() => {});
    } catch (err) {
      console.error('Failed to end session:', err);
    }
  };

  const handleMarkDone = async () => {
    if (!selectedItem) return;
    setMarkingDone(true);
    try {
      await updatePlanItemStatus(selectedItem.id, 'done');
      // Refresh plans and user state
      const updated = await getAllPlans();
      setPlans(updated);
      await refreshUserState();
      const updatedPlan = updated.find((p) => p.id === selectedPlanId);
      const nextPending = updatedPlan?.items.find((item) => item.status === 'pending');
      if (nextPending) {
        setSelectedPlanItemId(nextPending.id);
        setDurationMinutes(nextPending.duration_minutes || 45);
      }
    } catch (err) {
      console.error('Failed to mark done:', err);
    } finally {
      setMarkingDone(false);
    }
  };

  const isSessionActive = session && !session.ended_at;
  const isSessionEnded = session && session.ended_at;

  // ── Progress stats ─────────────────────────────────────────────────────────
  const totalItems = planItems.length;
  const doneItems = planItems.filter((item) => item.status === 'done').length;
  const progressPct = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-200/80">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Focus Session
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Study your planned topics, track focus, and build progress.
          </p>
        </div>

        {/* Study Dashboard Header */}
        {selectedItem && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm min-w-[140px]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Topic</p>
              <p className="text-xs font-bold text-slate-900 truncate">{selectedItem.topic_name}</p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm min-w-[140px]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Session Timer</p>
              <p className="text-xs font-mono font-bold text-indigo-600">{formatTime(elapsedTime)}</p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm min-w-[140px]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Focus Score</p>
              <p className="text-xs font-bold text-slate-900">{focusScore}%</p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm min-w-[140px]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Overall Progress</p>
              <p className="text-xs font-bold text-slate-900">{progressPct}%</p>
            </div>
          </div>
        )}
      </div>


      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* ── Consent modal ──────────────────────────────────────────────────── */}
      {showConsent && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Before you begin</p>
              <h2 className="text-2xl font-extrabold text-slate-900 mt-2">Choose your focus mode</h2>
              <p className="text-sm text-slate-500 mt-2">
                Monitoring runs on this device only. No camera video is uploaded.
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Strictness</label>
              <div className="grid grid-cols-3 gap-2">
                {(['lenient', 'balanced', 'strict'] as MonitoringStrictness[]).map((level) => (
                  <button key={level} type="button" onClick={() => setStrictness(level)}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-bold capitalize ${strictness === level ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 cursor-pointer">
              <input type="checkbox" checked={monitoringRequested}
                onChange={(e) => setMonitoringRequested(e.target.checked)} className="mt-1" />
              <span>
                <strong className="block text-sm text-slate-800">Allow camera for this session</strong>
                <span className="block text-xs text-slate-500 mt-1">Face attention, drowsiness, and local phone detection enabled.</span>
              </span>
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <button type="button" onClick={() => void beginSession(false)}
                className="flex-1 px-4 py-3 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold">
                Start unmonitored
              </button>
              <button type="button" onClick={() => void beginSession(monitoringRequested)}
                className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold">
                Start session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Active warning overlay ──────────────────────────────────────────── */}
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

      {/* ── Main two-column layout ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ── LEFT: Topic Explanation panel ─────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Topic selector */}
          {!session && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
              <h2 className="text-base font-bold text-slate-900">Today's Study Plan</h2>

              {plansLoading && (
                <div className="flex items-center gap-3 text-sm text-indigo-600">
                  <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                  Loading your study plan...
                </div>
              )}
              {plansError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{plansError}</div>
              )}
              {!plansLoading && !plansError && plans.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 text-center">
                  <p className="font-semibold mb-2">No study plans found</p>
                  <button onClick={() => navigate('/planner')}
                    className="text-indigo-600 underline text-xs">Create a plan first →</button>
                </div>
              )}

              {plans.length > 0 && (
                <>
                  <div className="space-y-4">
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Select Plan
                    </label>
                    <select
                      value={selectedPlanId ?? ''}
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        const plan = plans.find((p) => p.id === id);
                        setSelectedPlanId(id);
                        const firstPending = plan?.items.find((item) => item.status === 'pending') ?? plan?.items[0];
                        setSelectedPlanItemId(firstPending?.id);
                        setDurationMinutes(firstPending?.duration_minutes || 45);
                      }}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                    >
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          Plan #{p.id} · {new Date(p.generated_at).toLocaleDateString()} · {p.items.length} topics
                        </option>
                      ))}
                    </select>
                  </div>

                  {planItems.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          Session Roadmap
                        </label>
                        <span className="text-[10px] font-bold text-indigo-500">{doneItems}/{totalItems} Complete</span>
                      </div>
                      <div className="space-y-2">
                        {planItems.map((item) => {
                          const isActive = selectedPlanItemId === item.id;
                          const isDone = item.status === 'done';

                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setSelectedPlanItemId(item.id);
                                setDurationMinutes(item.duration_minutes || 45);
                              }}
                              className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left transition-all ${
                                isActive
                                  ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/20 shadow-sm'
                                  : isDone
                                    ? 'border-slate-200 bg-slate-50 opacity-60'
                                    : 'border-slate-200 bg-white hover:border-indigo-200'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className={`w-2 h-2 rounded-full ${
                                  isDone ? 'bg-emerald-500' : isActive ? 'bg-indigo-500 animate-pulse' : 'bg-slate-300'
                                }`} />
                                <span className={`text-sm font-bold ${isActive ? 'text-indigo-900' : isDone ? 'text-slate-500' : 'text-slate-800'}`}>
                                  {item.topic_name}
                                </span>
                              </div>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                isDone
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : isActive
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : 'bg-slate-100 text-slate-500'
                              }`}>
                                {isDone ? '✓' : isActive ? 'Active' : 'Pending'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                        Explanation Level
                      </label>
                      <select
                        value={explanationMode}
                        onChange={(e) => setExplanationMode(e.target.value as typeof explanationMode)}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                      >
                        <option value="child">Child — Simple</option>
                        <option value="average">Average — Standard</option>
                        <option value="topper">Topper — Advanced</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                        Timer (minutes)
                      </label>
                      <input
                        type="number" min="10" max="240" step="5"
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(Math.max(10, Math.min(240, Number(e.target.value) || 10)))}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Topic Explanation */}
          {selectedItem && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-slate-50 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Topic Explanation</p>
                  <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">{selectedItem.topic_name}</h2>
                </div>
                <span className="text-xs text-slate-500 font-semibold capitalize">{explanationMode} level</span>
              </div>
              <div className="p-6">
                {explanationLoading && (
                  <div className="flex items-center gap-3 py-4">
                    <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                    <span className="text-sm text-indigo-600">Generating your {explanationMode}-level explanation...</span>
                  </div>
                )}
                {!explanationLoading && explanationError && (
                  <p className="text-sm text-rose-600">{explanationError}</p>
                )}
                {!explanationLoading && explanation && (
                  <ExplanationContent text={explanation} />
                )}
              </div>
            </div>
          )}

          {/* Session History */}
          {history.length > 0 && !isSessionActive && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="font-bold text-slate-900">Session History</h2>
              </div>
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {history.slice(0, 10).map((s) => (
                  <div key={s.id} className="px-6 py-3 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-semibold text-slate-800">Session #{s.id}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(s.started_at).toLocaleString()} · {s.duration_minutes ?? '?'} min
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`font-bold ${(s.focus_score ?? 100) >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {s.focus_score != null ? `${Math.round(s.focus_score)}%` : '—'} focus
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Focus console ───────────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-5">
          {/* Timer card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center">
            <div className="relative inline-flex flex-col items-center justify-center mb-6">
              <div className="w-40 h-40 rounded-full border-8 border-indigo-50 flex flex-col items-center justify-center relative bg-gradient-to-b from-slate-50 to-white shadow-inner">
                {isSessionActive && (
                  <div className="absolute inset-0 rounded-full border-8 border-indigo-500 border-t-transparent animate-spin" style={{ animationDuration: '3s' }} />
                )}
                <span className="text-4xl font-black text-slate-900 tracking-tight font-mono">
                  {formatTime(elapsedTime)}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-1">
                  {isSessionActive ? 'Active' : isSessionEnded ? 'Done' : 'Ready'}
                </span>
              </div>
            </div>

            {/* Before session */}
            {!session && selectedItem && (
              <div className="space-y-4">
                <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3 text-left">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 mb-1">Session Topic</p>
                  <p className="text-sm font-bold text-slate-800">{selectedItem.topic_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{durationMinutes} minutes planned</p>
                </div>
                <button
                  onClick={handleStart}
                  disabled={loading}
                  className="w-full py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-600/25 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Start Focus Session
                </button>
                {selectedItem.status !== 'done' && (
                  <button
                    onClick={handleMarkDone}
                    disabled={markingDone}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-xs border border-emerald-200 transition-all"
                  >
                    {markingDone ? 'Saving...' : '✓ Mark as Done (no session)'}
                  </button>
                )}
              </div>
            )}

            {/* No plan item selected */}
            {!session && !selectedItem && !plansLoading && (
              <p className="text-sm text-slate-500">Select a topic to start your session.</p>
            )}

            {/* Session Active */}
            {isSessionActive && (
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Session #{session.id} active
                </div>
                <button
                  onClick={handleEnd}
                  disabled={loading}
                  className="w-full py-3.5 px-6 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-lg active:scale-95 transition-all cursor-pointer"
                >
                  {loading ? 'Saving...' : 'Complete & Save Session'}
                </button>
              </div>
            )}

            {/* Session Ended */}
            {isSessionEnded && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-600 text-white font-bold shadow-md mb-3">✓</div>
                  <h3 className="text-base font-bold text-slate-900">Session Complete!</h3>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="p-2.5 bg-white/80 rounded-xl border border-emerald-100">
                      <p className="text-[10px] font-semibold uppercase text-slate-400">Focus</p>
                      <p className="text-xl font-black text-emerald-600">
                        {session.focus_score != null ? `${Math.round(session.focus_score)}%` : '100%'}
                      </p>
                    </div>
                    <div className="p-2.5 bg-white/80 rounded-xl border border-emerald-100">
                      <p className="text-[10px] font-semibold uppercase text-slate-400">Duration</p>
                      <p className="text-xl font-black text-teal-600">{formatTime(elapsedTime)}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {selectedItem && selectedItem.status !== 'done' && (
                    <button onClick={handleMarkDone} disabled={markingDone}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-all">
                      {markingDone ? 'Saving...' : '✓ Mark Topic as Done'}
                    </button>
                  )}
                  <button onClick={() => navigate('/quiz')}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-all">
                    Take Quiz on This Topic →
                  </button>
                  <button onClick={() => window.location.reload()}
                    className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all">
                    Start New Session
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Focus panel (active session only) */}
          {isSessionActive && (
            <div className="rounded-2xl border border-slate-700 bg-slate-950 text-white overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <button type="button" onClick={() => setFocusPanelOpen((o) => !o)} className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${focusScore >= 70 ? 'bg-emerald-400' : focusScore >= 40 ? 'bg-amber-400' : 'bg-rose-400'}`} />
                  <span className="text-sm font-extrabold">Face Tracking</span>
                </button>
                <span className="text-2xl font-black">{focusScore}%</span>
              </div>
              {focusPanelOpen && (
                <div className="space-y-3 p-3">
                  <video ref={videoRef} muted playsInline
                    className={`aspect-video w-full rounded-xl bg-black object-cover ${monitoring ? '' : 'hidden'}`} />
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-white/10 px-3 py-2">
                      <span className="block text-slate-400">Warnings</span>
                      <strong>{warningCount}</strong>
                    </div>
                    <div className="rounded-lg bg-white/10 px-3 py-2">
                      <span className="block text-slate-400">Tab switches</span>
                      <strong>{tabSwitchCount}</strong>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-300">{detectorStatus}</p>
                  {monitorError && (
                    <p className="rounded-lg bg-rose-400/15 p-2 text-[11px] text-rose-200">{monitorError}</p>
                  )}
                  {events.length > 0 && (
                    <div className="max-h-24 space-y-1 overflow-auto rounded-lg bg-amber-400/10 p-2 text-[11px] text-amber-100">
                      {events.map((e, i) => <p key={`${e.type}-${i}`}>{e.message}</p>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { useAuth } from '../contexts/AuthContext';
import { useFaceDetection } from '../hooks/useFaceDetection';
import { usePhoneDetection } from '../hooks/usePhoneDetection';
import { useProctoring } from '../hooks/useProctoring';
import { FocusTracker } from '../components/FocusTracker';
import {
  explainTopic,
  getAllPlans,
  getSessionHistory,
  updatePlanItemStatus,
  getUserSubjects,
  getSubjectTopics,
  getStoredExplanations,
} from '../api/client';

import type { StudyPlanOut, StudySessionOut, UserSubject, SubjectTopic, StoredExplanation } from '../api/types';

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
  const faceDetection = useFaceDetection();
  const phoneDetection = usePhoneDetection(faceDetection.videoRef);
  const isSessionActive = session && !session.ended_at;
  const isSessionEnded = session && session.ended_at;

  const proctoring = useProctoring({
    sessionId: session?.id,
    isSessionActive: Boolean(isSessionActive),
    cameraStatus: faceDetection.cameraStatus,
    cameraError: faceDetection.cameraError,
    faceDetected: faceDetection.faceDetected,
    faceDetections: faceDetection.detections,
    phoneDetected: phoneDetection.phoneDetected,
    phoneConfidence: phoneDetection.phoneConfidence,
    phoneBox: phoneDetection.phoneBox,
  });

  // Plans & topics
  const [plans, setPlans] = useState<StudyPlanOut[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<number | undefined>();
  const [selectedPlanItemId, setSelectedPlanItemId] = useState<number | null | undefined>();

  // Subject-first navigation state
  const [allSubjects, setAllSubjects] = useState<UserSubject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<UserSubject | null>(null);
  const [subjectTopics, setSubjectTopics] = useState<SubjectTopic[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingSubjectTopics, setLoadingSubjectTopics] = useState(false);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<SubjectTopic | null>(null);

  // Topic explanation
  const [explanationMode, setExplanationMode] = useState<'child' | 'average' | 'topper'>('average');
  const [explanation, setExplanation] = useState('');
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState('');

  // Session setup
  const [durationMinutes, setDurationMinutes] = useState(45);

  // Session history
  const [history, setHistory] = useState<StudySessionOut[]>([]);

  // Marking done / updating
  const [markingDone, setMarkingDone] = useState(false);

  // View all explanations state
  const [showAllExplanations, setShowAllExplanations] = useState(false);
  const [allExplanations, setAllExplanations] = useState<StoredExplanation[]>([]);
  const [loadingExplanations, setLoadingExplanations] = useState(false);

  const handleLoadAllExplanations = async () => {
    setLoadingExplanations(true);
    try {
      const response = await getStoredExplanations();
      setAllExplanations(response.explanations || []);
      setShowAllExplanations(true);
    } catch (err) {
      console.error('Failed to load explanations:', err);
    } finally {
      setLoadingExplanations(false);
    }
  };


  // ── Load subjects on mount ────────────────────────────────────────────────────
  useEffect(() => {
    setPlansLoading(true);
    setLoadingSubjects(true);
    Promise.all([
      getAllPlans(),
      getUserSubjects(),
    ])
      .then(([items, subjectsResponse]) => {
        setPlans(items);
        setAllSubjects(subjectsResponse.subjects || []);

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
        setSubjectsError(null);
      })
      .catch((err) => {
        console.error('Failed to load study plans:', err);
        setPlansError('Study plans could not be loaded. Please refresh and try again.');
        setSubjectsError('Failed to load subjects. Please try again.');
      })
      .finally(() => {
        setPlansLoading(false);
        setLoadingSubjects(false);
      });
  }, [userState?.active_plan]);

  const loadSubjectTopics = async (subjectId: number) => {
    setLoadingSubjectTopics(true);
    try {
      const response = await getSubjectTopics(subjectId);
      setSubjectTopics(response.topics || []);
    } catch (err: any) {
      console.error('Failed to load subject topics:', err);
      setSubjectsError('Failed to load topics for this subject.');
    } finally {
      setLoadingSubjectTopics(false);
    }
  };

  const handleOpenSubject = (subject: UserSubject) => {
    setSelectedSubject(subject);
    loadSubjectTopics(subject.id);
  };

  const handleBackToSubjects = () => {
    setSelectedSubject(null);
    setSubjectTopics([]);
  };

  // ── Load session history ───────────────────────────────────────────────────
  useEffect(() => {
    getSessionHistory()
      .then(setHistory)
      .catch(() => {});
  }, []);

  // ── Load subjects on mount ────────────────────────────────────────────────────
  useEffect(() => {
    setPlansLoading(true);
    setLoadingSubjects(true);
    Promise.all([
      getAllPlans(),
      getUserSubjects(),
    ])
      .then(([items, subjectsResponse]) => {
        setPlans(items);
        setAllSubjects(subjectsResponse.subjects || []);

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
        setSubjectsError(null);
      })
      .catch((err) => {
        console.error('Failed to load study plans:', err);
        setPlansError('Study plans could not be loaded. Please refresh and try again.');
        setSubjectsError('Failed to load subjects. Please try again.');
      })
      .finally(() => {
        setPlansLoading(false);
        setLoadingSubjects(false);
      });
  }, [userState?.active_plan]);

  // ── Derive selected plan and item ─────────────────────────────────────────
  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const planItems = selectedPlan?.items || [];
  const selectedItem = planItems.find((item) => item.id === selectedPlanItemId);

  // ── Generate topic explanation when item changes ───────────────────────────
  useEffect(() => {
    const topicName = selectedTopic?.name || selectedItem?.topic_name;
    if (!topicName) return;
    setExplanationLoading(true);
    setExplanation('');
    setExplanationError('');
    explainTopic({ topic_name: topicName, mode: explanationMode })
      .then((res) => setExplanation(res.explanation))
      .catch(() => setExplanationError('Could not generate explanation. The AI may be busy — try again.'))
      .finally(() => setExplanationLoading(false));
  }, [selectedTopic?.id, selectedItem?.id, explanationMode]);

  // ── Session actions ────────────────────────────────────────────────────────
  const handleStart = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => undefined);
      }
      await startSession({
        plan_item_id: selectedPlanItemId || null, // Allow null for topics not in plan
        subtopic: selectedTopic?.name || selectedItem?.topic_name || undefined, // Use topic name if no plan item
        explanation_mode: explanationMode,
        duration_minutes: durationMinutes,
      });
      // Start face detection & phone detection
      await faceDetection.startTracking();
      await phoneDetection.startPhoneDetection();
    } catch (err) {
      console.error('Failed to start session:', err);
    }
  };

  const handleEnd = async () => {
    if (!session) return;
    try {
      // Stop face detection & phone detection
      faceDetection.stopTracking();
      phoneDetection.stopPhoneDetection();
      await endSession(session.id);
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



  // ── Progress stats (Requirement 7) ─────────────────────────────────────────
  const totalItems = planItems.length;
  const completedItems = planItems.filter((item) => item.status === 'done');
  const remainingItems = planItems.filter((item) => item.status !== 'done' && item.id !== selectedPlanItemId);
  const doneItems = completedItems.length;
  const progressPct = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;
  const remainingDuration = remainingItems.reduce((acc, curr) => acc + (curr.duration_minutes || 0), 0);

  return (
    <div className="space-y-8">
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Focus Session
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time focus monitoring, structured topic breakdown, and active roadmap tracking.
          </p>
        </div>
        {selectedPlan && (
          <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-2xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Overall Plan Progress</span>
              <span className="text-sm font-extrabold text-slate-800">
                {doneItems} of {totalItems} completed ({progressPct}%)
              </span>
            </div>
            <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── FOCUS TRACKING & ROADMAP SECTION (Requirement 7) ───────────────── */}
      {selectedPlan && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-900">
                Study & Focus Roadmap
              </h2>
              <p className="text-xs text-slate-500">Live breakdown of your active session, completed topics, and remaining tasks</p>
            </div>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
              Plan #{selectedPlan.id}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* 1. CURRENT STUDY */}
            <div className="rounded-2xl border-2 border-indigo-500 bg-gradient-to-b from-indigo-50/70 to-white p-5 space-y-3.5 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700">CURRENT TOPIC</span>
                <span className="bg-indigo-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">
                  {isSessionActive ? 'Active Now' : 'Selected'}
                </span>
              </div>
              <h3 className="text-base font-extrabold text-slate-900 truncate">
                {selectedItem?.topic_name || 'No Topic Selected'}
              </h3>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">CURRENT SUBTOPIC / MODE</span>
                <p className="text-xs font-semibold text-slate-700 mt-0.5">
                  {explanationMode === 'child' ? 'Child — Intuitive Concepts' : explanationMode === 'topper' ? 'Topper — Advanced Depth' : 'Average — Standard Curriculum'}
                </p>
              </div>

              <div className="pt-3 border-t border-indigo-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">SESSION DURATION</span>
                <p className="text-sm font-black text-slate-800 font-mono mt-0.5">
                  {isSessionActive ? formatTime(elapsedTime) : `${durationMinutes} mins`}
                </p>
              </div>
            </div>

            {/* 2. COMPLETED */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/20 p-5 space-y-3 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-emerald-100 pb-2 mb-3">
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black">✓</span>
                    Completed ({completedItems.length})
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700">{progressPct}%</span>
                </div>
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {completedItems.length > 0 ? (
                    completedItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-2 rounded-xl bg-white border border-emerald-100 text-xs shadow-2xs">
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-emerald-600 font-black">✓</span>
                          <span className="font-semibold text-slate-700 truncate">{item.topic_name}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 ml-2 whitespace-nowrap">{item.duration_minutes}m</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 italic py-5 text-center">No completed topics yet. Finish a session to see them checked off here.</p>
                  )}
                </div>
              </div>
            </div>

            {/* 3. REMAINING */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 space-y-3 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full border border-slate-400 text-slate-600 flex items-center justify-center text-[10px] font-black">○</span>
                    Remaining ({remainingItems.length})
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">{remainingDuration} mins left</span>
                </div>
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {remainingItems.length > 0 ? (
                    remainingItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedPlanItemId(item.id);
                          setDurationMinutes(item.duration_minutes || 45);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-xl text-xs text-left transition-all ${
                          item.id === selectedPlanItemId
                            ? 'bg-indigo-50 border border-indigo-200 text-indigo-900 font-bold'
                            : 'bg-white border border-slate-200 hover:border-indigo-200 text-slate-700 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-slate-400 font-bold">○</span>
                          <span className="truncate">{item.topic_name}</span>
                        </div>
                        <span className="text-[10px] font-semibold text-slate-400 ml-2 whitespace-nowrap">{item.duration_minutes}m</span>
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-emerald-600 font-bold py-5 text-center">All topics in this plan are completed!</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* ── Main two-column layout ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ── LEFT: Topic Explanation panel ─────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Subject-first topic selector */}
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

              {plans.length > 0 && !selectedSubject && (
                <>
                  {/* Subjects View - Level 1 */}
                  {loadingSubjects ? (
                    <div className="p-12 text-center text-slate-500">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-indigo-600 mx-auto mb-3"></div>
                      <p className="text-sm font-medium">Loading your subjects...</p>
                    </div>
                  ) : subjectsError ? (
                    <div className="p-12 text-center">
                      <p className="text-sm text-red-600 font-medium mb-3">{subjectsError}</p>
                    </div>
                  ) : allSubjects.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {allSubjects.map((subject) => (
                        <div
                          key={subject.id}
                          className="rounded-xl border border-slate-200 p-5 hover:shadow-md transition-all cursor-pointer bg-white"
                          onClick={() => handleOpenSubject(subject)}
                        >
                          <h3 className="text-lg font-bold text-slate-900 mb-3">{subject.name}</h3>
                          <div className="space-y-2 mb-4">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">Total Topics:</span>
                              <span className="font-semibold text-slate-900">{subject.total_topics}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">Completed:</span>
                              <span className="font-semibold text-emerald-600">{subject.completed_topics}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">In Progress:</span>
                              <span className="font-semibold text-amber-600">{subject.in_progress_topics}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">Planned:</span>
                              <span className="font-semibold text-slate-700">{subject.planned_topics}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                            <div className="flex items-center gap-2">
                              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-2 bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all"
                                  style={{ width: `${subject.progress_percentage}%` }}
                                />
                              </div>
                              <span className="text-xs font-bold text-slate-900">{subject.progress_percentage}%</span>
                            </div>
                            <span className="text-xs font-semibold text-indigo-600">Open →</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-12 text-center text-slate-500">
                      <p className="text-sm font-semibold">No subjects found</p>
                    </div>
                  )}
                </>
              )}

              {selectedSubject && (
                <>
                  {/* Subject Topics View - Level 2 */}
                  <div className="flex items-center gap-3 mb-4">
                    <button
                      onClick={handleBackToSubjects}
                      className="p-2 rounded-lg hover:bg-slate-200 transition-all text-slate-600"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{selectedSubject.name}</h3>
                      <p className="text-xs text-slate-500">{subjectTopics.length} topics</p>
                    </div>
                  </div>

                  {loadingSubjectTopics ? (
                    <div className="p-12 text-center text-slate-500">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-indigo-600 mx-auto mb-3"></div>
                      <p className="text-sm font-medium">Loading topics...</p>
                    </div>
                  ) : subjectTopics.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {subjectTopics.map((topic) => {
                        const isInProgress = topic.status === 'in_progress';
                        const isDone = topic.status === 'done';
                        const isPlanned = topic.status === 'pending';
                        const isSelected = selectedTopic?.id === topic.id || selectedPlanItemId === topic.item_id;

                        return (
                          <div
                            key={topic.id}
                            className={`rounded-xl border p-5 transition-all hover:shadow-md cursor-pointer ${
                              isSelected
                                ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/20 shadow-sm'
                                : isInProgress
                                ? 'bg-amber-50 border-amber-300'
                                : isDone
                                ? 'bg-emerald-50 border-emerald-300'
                                : 'bg-white border-slate-200'
                            }`}
                            onClick={() => {
                              setSelectedTopic(topic);
                              if (topic.item_id) {
                                setSelectedPlanItemId(topic.item_id);
                                // Find the plan item to get the correct duration
                                const planItem = planItems.find(p => p.topic_id === topic.id);
                                setDurationMinutes(planItem?.duration_minutes || (topic.estimated_hours * 60) || 45);
                              } else {
                                setSelectedPlanItemId(null);
                                setDurationMinutes(topic.estimated_hours * 60 || 45);
                              }
                            }}
                          >
                            <h3 className={`text-base font-bold mb-3 ${isDone ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                              {topic.name}
                            </h3>

                            <div className="space-y-2 mb-4">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">Status:</span>
                                {isInProgress && (
                                  <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                                    IN PROGRESS
                                  </span>
                                )}
                                {isPlanned && (
                                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                                    PLANNED
                                  </span>
                                )}
                                {isDone && (
                                  <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    COMPLETED
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">Difficulty:</span>
                                <span className="text-xs font-medium capitalize text-slate-900">{topic.difficulty}</span>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">Duration:</span>
                                <span className="text-xs font-medium text-slate-900">{topic.estimated_hours}h</span>
                              </div>
                            </div>

                            {isSelected && (
                              <div className="pt-3 border-t border-slate-200/50">
                                <span className="text-xs font-bold text-indigo-600">Selected for session</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-12 text-center text-slate-500">
                      <p className="text-sm font-semibold">No topics found in this subject</p>
                    </div>
                  )}

                  {selectedItem && (
                    <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-200">
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
                  )}
                </>
              )}
            </div>
          )}

          {/* Topic Explanation - Only show when session is active */}
          {isSessionActive && (selectedTopic || selectedItem) && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-slate-50 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Topic Explanation</p>
                  <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">{selectedTopic?.name || selectedItem?.topic_name}</h2>
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

          {/* All Stored Explanations Modal */}
          {showAllExplanations && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-slate-50 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-slate-900">All Stored Explanations</h2>
                  <p className="text-xs text-slate-500 mt-0.5">View all your previously generated topic explanations</p>
                </div>
                <button
                  onClick={() => setShowAllExplanations(false)}
                  className="p-2 rounded-lg hover:bg-slate-200 transition-all text-slate-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6 max-h-96 overflow-y-auto">
                {loadingExplanations ? (
                  <div className="flex items-center gap-3 py-4">
                    <div className="w-5 h-5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                    <span className="text-sm text-indigo-600">Loading explanations...</span>
                  </div>
                ) : allExplanations.length > 0 ? (
                  <div className="space-y-4">
                    {allExplanations.map((exp, idx) => (
                      <div key={idx} className="border border-slate-200 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-slate-900">{exp.topic_name}</h3>
                          <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full capitalize">
                            {exp.explanation_mode}
                          </span>
                        </div>
                        <div className="text-sm text-slate-700 whitespace-pre-wrap max-h-40 overflow-y-auto bg-slate-50 p-3 rounded-lg">
                          {exp.content}
                        </div>
                        <p className="text-xs text-slate-400 mt-2">
                          Generated: {new Date(exp.generated_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <p className="text-sm font-semibold">No stored explanations found</p>
                    <p className="text-xs mt-1">Start a focus session to generate and store explanations</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Focus console ───────────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-5">
          {/* Focus Tracker (camera + face detection + proctoring) */}
          {(isSessionActive || faceDetection.cameraStatus !== 'idle') && (
            <FocusTracker
              videoRef={faceDetection.videoRef}
              canvasRef={faceDetection.canvasRef}
              cameraStatus={faceDetection.cameraStatus}
              cameraError={faceDetection.cameraError}
              faceDetected={faceDetection.faceDetected}
              focusScore={faceDetection.focusScore}
              trackingActive={faceDetection.trackingActive}
              proctoringActive={proctoring.proctoringActive}
              peopleCount={proctoring.peopleCount}
              phoneDetected={proctoring.phoneStatus === 'detected'}
              phoneConfidence={phoneDetection.phoneConfidence}
              phoneBox={phoneDetection.phoneBox}
              activeWarning={proctoring.activeWarning}
              activeViolationType={proctoring.activeViolationType}
              totalWarnings={proctoring.totalWarnings}
              isLookingAway={proctoring.isLookingAway}
            />
          )}
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
            {!session && (selectedTopic || selectedItem) && (
              <div className="space-y-4">
                <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3 text-left">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 mb-1">Session Topic</p>
                  <p className="text-sm font-bold text-slate-800">{selectedTopic?.name || selectedItem?.topic_name}</p>
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
                <button
                  onClick={handleLoadAllExplanations}
                  disabled={loadingExplanations}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 transition-all"
                >
                  {loadingExplanations ? 'Loading...' : '📚 View All Stored Explanations'}
                </button>
                {selectedItem && selectedItem.status !== 'done' && (
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
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div className="p-2.5 bg-white/80 rounded-xl border border-emerald-100">
                      <p className="text-[10px] font-semibold uppercase text-slate-400">Focus</p>
                      <p className="text-xl font-black text-emerald-600">
                        {faceDetection.focusScore != null ? `${faceDetection.focusScore}%` : (session.focus_score != null ? `${Math.round(session.focus_score)}%` : '100%')}
                      </p>
                    </div>
                    <div className="p-2.5 bg-white/80 rounded-xl border border-emerald-100">
                      <p className="text-[10px] font-semibold uppercase text-slate-400">Duration</p>
                      <p className="text-xl font-black text-teal-600">{formatTime(elapsedTime)}</p>
                    </div>
                    <div className="p-2.5 bg-white/80 rounded-xl border border-emerald-100">
                      <p className="text-[10px] font-semibold uppercase text-slate-400">Warnings</p>
                      <p className={`text-xl font-black ${proctoring.totalWarnings === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {proctoring.totalWarnings}
                      </p>
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
                  {(selectedTopic || selectedItem) && (
                    <button onClick={() => navigate('/quiz')}
                      className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-all">
                      Take Quiz on This Topic →
                    </button>
                  )}
                  <button onClick={() => window.location.reload()}
                    className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all">
                    Start New Session
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};


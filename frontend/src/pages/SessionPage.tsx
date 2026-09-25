import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { explainDocumentSubtopic, getAllPlans, getTopicDocuments, uploadFocusDocument } from '../api/client';
import { useFocusMonitoring } from '../hooks/useFocusMonitoring';
import type { MonitoringStrictness, StudyDocument, StudyPlanOut } from '../api/types';

export const SessionPage: React.FC = () => {
  const { session, loading, error, elapsedTime, formatTime, startSession, endSession } = useSession();
  const [plans, setPlans] = useState<StudyPlanOut[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<number | undefined>();
  const [selectedPlanItemId, setSelectedPlanItemId] = useState<number | undefined>(undefined);
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [focusDocument, setFocusDocument] = useState<StudyDocument | null>(null);
  const [focusUploadLoading, setFocusUploadLoading] = useState(false);
  const [focusUploadError, setFocusUploadError] = useState('');
  const [openTopicName, setOpenTopicName] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | undefined>();
  const [selectedSubtopic, setSelectedSubtopic] = useState('');
  const [explanationMode, setExplanationMode] = useState<'child' | 'average' | 'topper'>('average');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [learningContent, setLearningContent] = useState('');
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationError, setExplanationError] = useState('');
  const [showConsent, setShowConsent] = useState(false);
  const [strictness, setStrictness] = useState<MonitoringStrictness>('balanced');
  const [monitoringRequested, setMonitoringRequested] = useState(true);
  const [focusPanelOpen, setFocusPanelOpen] = useState(true);
  const { videoRef, monitoring, detectorStatus, monitorError, events, warningCount, focusScore, activeWarning, tabSwitchCount, startMonitoring, stopMonitoring } = useFocusMonitoring();
  const navigate = useNavigate();

  useEffect(() => {
    setPlansLoading(true);
    getAllPlans().then(async (items) => {
      setPlans(items);
      const allItems = items.flatMap((plan) => plan.items.map((item) => ({ plan, item })));
      const documentResults = await Promise.all(
        allItems.map(async ({ item }) => [item.topic_id, await getTopicDocuments(item.topic_id)] as const)
      );
      const documentsByTopic = new Map(documentResults);
      const itemWithDocument = allItems.find(({ item }) =>
        (documentsByTopic.get(item.topic_id) || []).some((document) => document.status === 'completed')
      );
      const initialSelection = itemWithDocument || allItems[0];
      setSelectedPlanId(initialSelection?.plan.id);
      setSelectedPlanItemId(initialSelection?.item.id);
      setPlansError('');
    }).catch((err) => {
      console.error('Failed to load study plans:', err);
      setPlansError('Study plans could not be loaded. Please refresh and try again.');
    }).finally(() => setPlansLoading(false));
  }, []);

  const selectedPlan = plans.find((item) => item.id === selectedPlanId);
  const planItems = selectedPlan?.items || [];
  const selectedItem = planItems.find((item) => item.id === selectedPlanItemId);
  const selectedDocument = documents.find((document) => document.id === selectedDocumentId);
  const activeDocument = focusDocument || selectedDocument;

  const handleFocusUpload = async (file: File) => {
    setFocusUploadLoading(true);
    setFocusUploadError('');
    try {
      const document = await uploadFocusDocument(file);
      setFocusDocument(document);
      setSelectedDocumentId(document.id);
      const firstTopic = document.structure[0];
      const firstSubtopic = firstTopic?.subtopics?.[0]?.name || '';
      setOpenTopicName(firstTopic?.name || '');
      setSelectedSubtopic(firstSubtopic);
      setLearningContent('');
      setExplanationError('');
    } catch (error: any) {
      setFocusUploadError(error.response?.data?.detail || 'The PDF/text document could not be processed.');
    } finally {
      setFocusUploadLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedPlanItemId) return;
    const item = planItems.find((planItem) => planItem.id === selectedPlanItemId);
    if (!item) return;
    setDurationMinutes(item.duration_minutes || 45);
    getTopicDocuments(item.topic_id).then((items) => {
      const completed = items.filter((document) => document.status === 'completed');
      setDocuments(completed);
      setSelectedDocumentId(completed[0]?.id);
      setSelectedSubtopic(completed[0]?.structure?.[0]?.subtopics?.[0]?.name || '');
      setLearningContent('');
      setExplanationError('');
    }).catch((err) => console.error('Failed to load topic documents:', err));
  }, [selectedPlanItemId, selectedPlanId]);

  const handleStart = () => {
    setShowConsent(true);
  };

  const beginSession = async (withMonitoring: boolean) => {
    setShowConsent(false);
    try {
      if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen().catch(() => undefined);
      const started = await startSession({
        plan_item_id: selectedPlanItemId,
        document_id: selectedDocumentId,
        subtopic: selectedSubtopic || undefined,
        explanation_mode: explanationMode,
        duration_minutes: durationMinutes,
      });
      if (activeDocument && selectedSubtopic) {
        setExplanationLoading(true);
        setExplanationError('');
        try {
          const explanation = await explainDocumentSubtopic(activeDocument.id, selectedSubtopic, explanationMode);
          setLearningContent(explanation.explanation);
        } catch (explanationRequestError: any) {
          console.error('Failed to load Focus Mode explanation:', explanationRequestError);
          setLearningContent('');
          setExplanationError(
            explanationRequestError.response?.data?.detail ||
            'The explanation could not be generated. The focus session is still running.'
          );
        } finally {
          setExplanationLoading(false);
        }
      } else {
        setLearningContent('');
        setExplanationError('Select a processed PDF and subtopic to show an AI explanation.');
      }
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
            <div className="space-y-4 text-left">
              {plansLoading && <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">Loading your study plans...</div>}
              {plansError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{plansError}</div>}
              {!plansLoading && !plansError && plans.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500">No study plans are available for this account. Create a plan in Study Planner first.</div>}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Study Plan</label>
                <select value={selectedPlanId ?? ''} onChange={(e) => { const id = Number(e.target.value); const nextPlan = plans.find((plan) => plan.id === id); setSelectedPlanId(id); setSelectedPlanItemId(nextPlan?.items[0]?.id); setDocuments([]); }} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm">
                  <option value="">Choose a study plan</option>
                  {plans.map((item) => <option key={item.id} value={item.id}>Plan #{item.id} · {new Date(item.generated_at).toLocaleDateString()}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Study Plan Item / Topic</label>
                <select value={selectedPlanItemId ?? ''} onChange={(e) => setSelectedPlanItemId(e.target.value ? Number(e.target.value) : undefined)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm">
                  <option value="">General Study Session</option>
                  {planItems.map((item) => <option key={item.id} value={item.id}>{item.topic_name || `Topic #${item.topic_id}`} · {item.duration_minutes} min</option>)}
                </select>
              </div>
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-indigo-800 mb-2">Upload PDF or text</label>
                <input
                  type="file"
                  accept=".pdf,.txt,.text,application/pdf,text/plain"
                  disabled={focusUploadLoading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFocusUpload(file);
                    event.target.value = '';
                  }}
                  className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-100 file:px-3 file:py-1.5 file:font-semibold file:text-indigo-700"
                />
                <p className="mt-2 text-xs text-indigo-700">AI will create the topics and subtopics automatically from the actual document.</p>
                {focusUploadLoading && <p className="mt-2 text-xs font-semibold text-indigo-700">Extracting, embedding, and structuring your document...</p>}
                {focusUploadError && <p className="mt-2 text-xs font-semibold text-rose-700">{focusUploadError}</p>}
              </div>
              {selectedPlan && planItems.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Topics in this plan</p>
                  <div className="space-y-2">
                    {planItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedPlanItemId(item.id)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition-colors ${selectedPlanItemId === item.id ? 'border-indigo-300 bg-white shadow-sm' : 'border-transparent bg-white/60 hover:border-slate-300'}`}
                      >
                        <span>
                          <span className="block text-sm font-bold text-slate-800">{item.topic_name || `Topic #${item.topic_id}`}</span>
                          <span className="block text-xs text-slate-500 mt-1">{item.duration_minutes} minutes · {item.status}</span>
                        </span>
                        <span className="text-indigo-500 text-lg">›</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {focusDocument && (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">AI-generated PDF topics</p><p className="mt-1 text-sm font-bold text-slate-800">{focusDocument.filename}</p></div>
                    <span className="text-xs font-semibold text-emerald-600">Processed</span>
                  </div>
                  {(focusDocument.structure || []).map((topic) => (
                    <div key={topic.name} className="overflow-hidden rounded-xl border border-slate-200">
                      <button type="button" onClick={() => { setOpenTopicName(openTopicName === topic.name ? '' : topic.name); setSelectedSubtopic(topic.subtopics[0]?.name || ''); }} className="flex w-full items-center justify-between bg-slate-50 px-4 py-3 text-left hover:bg-indigo-50">
                        <span className="text-sm font-bold text-slate-800">{topic.name}</span><span className="text-indigo-500">{openTopicName === topic.name ? '⌄' : '›'}</span>
                      </button>
                      {openTopicName === topic.name && <div className="space-y-2 border-t border-slate-200 p-3">{topic.subtopics.map((subtopic) => <button key={subtopic.name} type="button" onClick={() => { setSelectedSubtopic(subtopic.name); setLearningContent(''); setExplanationError(''); }} className={`block w-full rounded-lg px-3 py-2 text-left text-xs ${selectedSubtopic === subtopic.name ? 'bg-indigo-100 font-bold text-indigo-800' : 'text-slate-600 hover:bg-slate-50'}`}>{subtopic.name}</button>)}</div>}
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Explanation</label><select value={explanationMode} onChange={(e) => { setExplanationMode(e.target.value as typeof explanationMode); setLearningContent(''); setExplanationError(''); }} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm"><option value="child">Child</option><option value="average">Average</option><option value="topper">Topper</option></select></div>
                <div><label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Timer (min)</label><input type="number" min="10" max="240" step="5" value={durationMinutes} onChange={(e) => setDurationMinutes(Math.max(10, Math.min(240, Number(e.target.value) || 10)))} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm" /></div>
              </div>
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
        <aside style={{ width: '352px', resize: 'horizontal', overflow: 'auto', minWidth: '280px', maxWidth: 'min(42rem, calc(100vw - 2rem))' }} className="fixed bottom-5 right-5 z-50 rounded-2xl border border-slate-700 bg-slate-950 text-white shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <button type="button" onClick={() => setFocusPanelOpen((open) => !open)} className="flex items-center gap-2 text-left">
              <span className={`h-2.5 w-2.5 rounded-full ${focusScore >= 70 ? 'bg-emerald-400' : focusScore >= 40 ? 'bg-amber-400' : 'bg-rose-400'}`} />
              <span className="text-sm font-extrabold">Focus Mode</span>
            </button>
            <span className="text-2xl font-black">{focusScore}%</span>
          </div>
          {focusPanelOpen && (
            <div className="space-y-3 p-3">
              <div className="rounded-xl border border-indigo-400/30 bg-indigo-500/15 p-4 text-left">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-200">Current lesson</p>
                <p className="mt-1 text-sm font-extrabold text-white">{selectedItem?.topic_name || 'General study session'}</p>
                {selectedSubtopic && <p className="mt-1 text-xs text-indigo-200">Subtopic: {selectedSubtopic}</p>}
                <p className="mt-1 text-[11px] uppercase tracking-wider text-slate-400">{explanationMode} mode · {durationMinutes} minutes</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3 text-left">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Study plan progress</p>
                <p className="mt-1 text-sm font-bold text-white">{selectedPlan ? `Plan #${selectedPlan.id}` : 'General session'}</p>
                <p className="mt-1 text-xs text-slate-300">{selectedItem ? `Item status: ${selectedItem.status}` : 'Not assigned to a plan item'}</p>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.06] p-4 text-left">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">AI explanation</p>
                {explanationLoading && <p className="mt-3 text-sm text-indigo-200">Preparing your {explanationMode}-level explanation from the selected PDF...</p>}
                {!explanationLoading && learningContent && <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-100">{learningContent}</div>}
                {!explanationLoading && !learningContent && explanationError && <p className="mt-3 text-sm leading-6 text-rose-200">{explanationError}</p>}
              </div>
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

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlan } from '../hooks/usePlan';
import { estimateTopic, getTopicDocuments, uploadTopicDocument } from '../api/client';
import type { StudyDocument, StudyPlanCreate } from '../api/types';

export const PlannerPage: React.FC = () => {
  const { plan, loading, error, hasPlan, createPlan } = usePlan();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [examDeadline, setExamDeadline] = useState('');
  const [topicName, setTopicName] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number>(45);
  const [studyFile, setStudyFile] = useState<File | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateReason, setEstimateReason] = useState('');
  const [creating, setCreating] = useState(false);
  const [documentsByTopic, setDocumentsByTopic] = useState<Record<number, StudyDocument[]>>({});
  const [uploadingTopicId, setUploadingTopicId] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const topicIds = [...new Set((plan?.items ?? []).map((item) => item.topic_id))];
    if (!topicIds.length) return;
    Promise.all(topicIds.map(async (topicId) => [topicId, await getTopicDocuments(topicId)] as const))
      .then((entries) => setDocumentsByTopic(Object.fromEntries(entries)))
      .catch((err) => console.error('Failed to load topic documents:', err));
  }, [plan?.id]);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicName.trim()) return;
    setCreating(true);

    try {
      const planData: StudyPlanCreate = {
        exam_deadline: examDeadline ? new Date(examDeadline).toISOString() : new Date(Date.now() + 14 * 86400000).toISOString(),
        items: [
          {
            topic_name: topicName.trim(),
            duration_minutes: durationMinutes,
          },
        ],
      };
      const newPlan = await createPlan(planData);
      const createdTopicId = newPlan.items[0]?.topic_id;
      if (studyFile && createdTopicId) {
        const document = await uploadTopicDocument(createdTopicId, studyFile);
        setDocumentsByTopic((current) => ({
          ...current,
          [createdTopicId]: [document, ...(current[createdTopicId] ?? [])],
        }));
      }
      setTopicName('');
      setStudyFile(null);
      setShowCreateForm(false);
    } catch (err) {
      console.error('Failed to create plan:', err);
    } finally {
      setCreating(false);
    }
  };

  const generateEstimate = async (name: string, file?: File) => {
    if (!name.trim()) return;
    setEstimateLoading(true);
    try {
      const estimate = await estimateTopic(name.trim(), file);
      const estimatedMinutes = Math.max(10, Math.min(240, Math.round((estimate.estimated_hours * 60) / 10) * 10));
      setDurationMinutes(estimatedMinutes);
      setEstimateReason(`${estimate.difficulty} difficulty: ${estimate.difficulty_reason}`);
    } catch (err) {
      console.error('Failed to generate AI estimate:', err);
      setEstimateReason('AI estimate unavailable. Please try again.');
    } finally {
      setEstimateLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600 mb-4"></div>
        <p className="text-sm font-medium text-slate-500">Loading your personalized study plan...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm text-center">
        {error}
      </div>
    );
  }

  const items = plan?.items || [];
  const totalDuration = items.reduce((acc, curr) => acc + curr.duration_minutes, 0);

  const handleDocumentUpload = async (topicId: number, file: File) => {
    setUploadingTopicId(topicId);
    try {
      const document = await uploadTopicDocument(topicId, file);
      setDocumentsByTopic((current) => ({
        ...current,
        [topicId]: [document, ...(current[topicId] ?? [])],
      }));
    } catch (err) {
      console.error('Failed to upload study document:', err);
    } finally {
      setUploadingTopicId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Study Planner
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Organize study goals, track schedules, and launch dedicated focus sessions.
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-600/20 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          {hasPlan ? 'Add / Replace Plan' : 'Create Study Plan'}
        </button>
      </div>

      {/* Overview Stats */}
      {hasPlan && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Topics</p>
              <p className="text-2xl font-extrabold text-slate-900">{items.length}</p>
            </div>

          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Planned Duration</p>
              <p className="text-2xl font-extrabold text-slate-900">{totalDuration} mins</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center font-bold">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Target Exam</p>
              <p className="text-sm font-bold text-slate-900 truncate max-w-[170px]">
                {plan?.exam_deadline ? new Date(plan.exam_deadline).toLocaleDateString() : 'Upcoming'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Creation Modal / Form */}
      {showCreateForm && (
        <div className="bg-white rounded-2xl shadow-lg border border-indigo-100 p-6 sm:p-8 transition-all animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Create Study Plan</h2>
              <p className="text-xs text-slate-500">Add a subject topic and set study time</p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleCreatePlan} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Topic name
                </label>
                <input
                  type="text"
                  required
                  value={topicName}
                  onChange={(e) => setTopicName(e.target.value)}
                  onBlur={() => void generateEstimate(topicName, studyFile ?? undefined)}
                  placeholder="e.g. Organic chemistry basics"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Duration (Minutes)
                </label>
                <input
                  type="number"
                  min="10"
                  max="240"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Math.max(10, Math.min(240, Number(e.target.value) || 10)))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Study document (optional)
              </label>
              <input
                type="file"
                accept=".pdf,.txt,.text,application/pdf,text/plain"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setStudyFile(file);
                  if (file && topicName.trim()) void generateEstimate(topicName, file);
                }}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-700 text-sm file:mr-3 file:border-0 file:bg-indigo-50 file:text-indigo-700 file:font-semibold file:px-3 file:py-1.5 file:rounded-lg"
              />
              <p className="text-xs text-slate-400 mt-1.5">The AI will use this document to estimate the study time, then process it after confirmation.</p>
            </div>

            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">Approximate study time</p>
                  <p className="text-xs text-slate-500 mt-1">{estimateLoading ? 'AI is estimating the topic...' : estimateReason || 'Enter a topic name or choose a document to generate an AI estimate.'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setDurationMinutes((minutes) => Math.max(10, minutes - 10))} className="px-3 py-2 rounded-lg border border-indigo-200 bg-white text-xs font-bold text-indigo-700 hover:bg-indigo-100">-10 min</button>
                  <span className="min-w-20 text-center text-lg font-extrabold text-indigo-700">{durationMinutes} min</span>
                  <button type="button" onClick={() => setDurationMinutes((minutes) => Math.min(240, minutes + 10))} className="px-3 py-2 rounded-lg border border-indigo-200 bg-white text-xs font-bold text-indigo-700 hover:bg-indigo-100">+10 min</button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Target Exam / Completion Deadline (Optional)
              </label>
              <input
                type="date"
                value={examDeadline}
                onChange={(e) => setExamDeadline(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all cursor-pointer"
              >
                {creating ? 'Saving Plan...' : 'Confirm Plan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Plan Items List */}
      {hasPlan && plan ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h2 className="font-bold text-slate-900 text-base">Current Study Plan Items</h2>
            <span className="text-xs font-medium text-slate-500">Plan ID: #{plan.id}</span>
          </div>

          {items.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {items.map((item, idx) => {
                const currentTopicName = item.topic_name || `Topic #${item.topic_id}`;
                const subject = 'My Topics';

                return (
                  <div
                    key={item.id || idx}
                    className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-bold text-slate-900">{currentTopicName}</span>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {subject}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {item.duration_minutes} Minutes
                        </span>
                        <span>•</span>
                        <span className="capitalize">Status: <strong className="text-slate-700">{item.status}</strong></span>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                        <div className="flex items-center gap-3">
                          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-xs font-semibold text-slate-700 hover:text-indigo-700 cursor-pointer transition-colors">
                            <span>{uploadingTopicId === item.topic_id ? 'Processing...' : 'Upload PDF or text'}</span>
                            <input
                              type="file"
                              accept=".pdf,.txt,.text,application/pdf,text/plain"
                              className="hidden"
                              disabled={uploadingTopicId === item.topic_id}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) void handleDocumentUpload(item.topic_id, file);
                                event.target.value = '';
                              }}
                            />
                          </label>
                          <span className="text-[11px] text-slate-400">{(documentsByTopic[item.topic_id] ?? []).length} document(s)</span>
                        </div>
                        {(documentsByTopic[item.topic_id] ?? []).map((document) => (
                          <div key={document.id} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-semibold text-slate-700 truncate">{document.filename}</span>
                              <span className={`font-semibold ${document.status === 'completed' ? 'text-emerald-600' : document.status === 'failed' ? 'text-red-600' : 'text-amber-600'}`}>
                                {document.status}
                              </span>
                            </div>
                            <p className="text-slate-400 mt-1">Uploaded {new Date(document.uploaded_at).toLocaleDateString()}</p>
                            {document.status === 'completed' && (
                              <div className="mt-2 text-slate-600 space-y-1">
                                <p><strong>Difficulty:</strong> {document.difficulty} {document.difficulty_reason ? `- ${document.difficulty_reason}` : ''}</p>
                                <p><strong>Estimated study:</strong> {document.estimated_hours} hours</p>
                                <p><strong>Concepts:</strong> {document.concepts.join(', ') || 'Not identified'}</p>
                              </div>
                            )}
                            {document.error_message && <p className="text-red-600 mt-1">{document.error_message}</p>}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 pt-2 sm:pt-0">
                      <button
                        onClick={() => navigate('/session')}
                        className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Focus Session
                      </button>

                      <button
                        onClick={() => navigate('/quiz')}
                        className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        Practice Quiz
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500">
              <p className="text-sm">No items in this plan yet. Click "Add / Replace Plan" above to create scheduled items.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1.5">No Study Plan Created Yet</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
            Get started by creating your customized study plan to schedule topics and track progress.
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-600/20 active:scale-95 transition-all cursor-pointer"
          >
            Create Your First Plan
          </button>
        </div>
      )}
    </div>
  );
};

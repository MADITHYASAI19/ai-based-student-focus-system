import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlan } from '../hooks/usePlan';
import { breakdownTopics, updatePlanItemStatus, getAllPlans, finalizePlan } from '../api/client';
import type { StudyPlanCreate, TopicConcept } from '../api/types';

export const PlannerPage: React.FC = () => {
  const { plan, loading, error, hasPlan, createPlan, refetch } = usePlan();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [examDeadline, setExamDeadline] = useState('');
  const [rawTopicsText, setRawTopicsText] = useState('');
  const [generatedTopics, setGeneratedTopics] = useState<TopicConcept[]>([]);
  const [isGeneratingTopics, setIsGeneratingTopics] = useState(false);
  const [creating, setCreating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [documentMessage, setDocumentMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [markingItem, setMarkingItem] = useState<number | null>(null);
  const navigate = useNavigate();

  const handleMarkItemStatus = async (itemId: number, newStatus: 'done' | 'pending' | 'skipped') => {
    setMarkingItem(itemId);
    try {
      await updatePlanItemStatus(itemId, newStatus);
      refetch();
    } catch (err) {
      setDocumentMessage({ type: 'error', text: 'Failed to update topic status.' });
    } finally {
      setMarkingItem(null);
    }
  };

  const handleGenerateTopics = async () => {
    if (!rawTopicsText.trim()) return;
    setIsGeneratingTopics(true);
    try {
      const res = await breakdownTopics(rawTopicsText.trim());
      setGeneratedTopics(res.topics || []);
    } catch (err) {
      console.error(err);
      setDocumentMessage({ type: 'error', text: 'Failed to generate topics from your input.' });
    } finally {
      setIsGeneratingTopics(false);
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (generatedTopics.length === 0) return;
    setCreating(true);

    try {
      const planData: StudyPlanCreate = {
        exam_deadline: examDeadline ? new Date(examDeadline).toISOString() : new Date(Date.now() + 14 * 86400000).toISOString(),
        items: generatedTopics.map((t) => ({
          topic_name: t.topic_name,
          duration_minutes: t.duration_minutes,
        })),
      };
      await createPlan(planData);
      setRawTopicsText('');
      setGeneratedTopics([]);
      setShowCreateForm(false);
      setDocumentMessage({ type: 'success', text: 'Study plan created successfully.' });
    } catch (err: any) {
      setDocumentMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to create the study plan.' });
    } finally {
      setCreating(false);
    }
  };

  const handleFinalizePlan = async () => {
    if (!plan) return;
    setFinalizing(true);
    try {
      await finalizePlan(plan.id);
      await refetch();
      setDocumentMessage({ type: 'success', text: 'Study plan finalized! This is now your active plan.' });
    } catch (err: any) {
      setDocumentMessage({ type: 'error', text: err.response?.data?.detail || 'Failed to finalize the study plan.' });
    } finally {
      setFinalizing(false);
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
  const doneCount = items.filter((i) => i.status === 'done').length;
  const progressPct = plan?.progress_percentage || (items.length ? Math.round((doneCount / items.length) * 100) : 0);

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

      {documentMessage && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${documentMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
          {documentMessage.text}
        </div>
      )}

      {/* Overview Stats */}
      {hasPlan && (
        <>
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

          {/* Progress bar */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-slate-700">Plan Progress</p>
              <span className="text-sm font-extrabold text-indigo-600">{doneCount} / {items.length} done · {progressPct}%</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-3 bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </>
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
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Give me all the topics you want to study
              </label>
              <textarea
                required
                value={rawTopicsText}
                onChange={(e) => setRawTopicsText(e.target.value)}
                placeholder="e.g. I want to study organic chemistry basics, specifically alkanes and alkenes, and also some basic biology..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm h-32"
              />
              <button
                type="button"
                onClick={handleGenerateTopics}
                disabled={isGeneratingTopics || !rawTopicsText.trim()}
                className="mt-2 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {isGeneratingTopics ? 'Analyzing...' : 'Generate Clean Topics'}
              </button>
            </div>

            {generatedTopics.length > 0 && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                <p className="text-sm font-bold text-slate-900 mb-3">Total Concepts Detected: {generatedTopics.length}</p>
                <div className="space-y-2">
                  {generatedTopics.map((topic, i) => (
                    <div key={i} className="flex justify-between items-center text-sm bg-white p-2 rounded-lg border border-indigo-100">
                      <span className="font-semibold text-slate-700">{topic.topic_name}</span>
                      <span className="text-indigo-600 font-bold">{topic.duration_minutes} min</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-slate-900 text-base">Current Study Plan Items</h2>
              {plan.is_active && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">Active</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-500">Plan ID: #{plan.id}</span>
              {!plan.is_active && (
                <button
                  onClick={handleFinalizePlan}
                  disabled={finalizing}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
                >
                  {finalizing ? 'Finalizing...' : 'Finalize Plan'}
                </button>
              )}
            </div>
          </div>

          {items.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {items.map((item, idx) => {
                const currentTopicName = item.topic_name || `Topic #${item.topic_id}`;
                const subject = 'My Topics';

                return (
                  <div
                    key={item.id || idx}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {/* Status indicator */}
                      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${
                        item.status === 'done' ? 'bg-emerald-500' :
                        item.status === 'skipped' ? 'bg-slate-300' : 'bg-amber-400'
                      }`} />
                      <div>
                        <span className="text-sm font-bold text-slate-900">{currentTopicName}</span>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                          <span>{item.duration_minutes} min</span>
                          <span>•</span>
                          <span className={`capitalize font-semibold ${
                            item.status === 'done' ? 'text-emerald-600' :
                            item.status === 'skipped' ? 'text-slate-400' : 'text-amber-600'
                          }`}>{item.status}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {item.status !== 'done' && (
                        <button
                          onClick={() => void handleMarkItemStatus(item.id, 'done')}
                          disabled={markingItem === item.id}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-all"
                        >
                          {markingItem === item.id ? '...' : '✓ Done'}
                        </button>
                      )}
                      {item.status === 'done' && (
                        <button
                          onClick={() => void handleMarkItemStatus(item.id, 'pending')}
                          disabled={markingItem === item.id}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 transition-all"
                        >
                          Undo Done
                        </button>
                      )}
                      <button
                        onClick={() => navigate('/session')}
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all flex items-center gap-1.5"
                      >
                        ▶ Study
                      </button>
                      <button
                        onClick={() => navigate('/quiz')}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-all"
                      >
                        Quiz
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

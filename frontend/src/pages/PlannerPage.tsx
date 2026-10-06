import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlan } from '../hooks/usePlan';
import { breakdownTopics, updatePlanItemStatus, finalizePlan, getUserSubjects, getSubjectTopics } from '../api/client';
import type { StudyPlanCreate, TopicConcept, PlanItemOut, UserSubject, SubjectTopic } from '../api/types';

export const PlannerPage: React.FC = () => {
  const { plan, loading, error, hasPlan, createPlan, refetch } = usePlan();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [examDeadline, setExamDeadline] = useState('');
  const [rawTopicsText, setRawTopicsText] = useState('');
  const [generatedTopics, setGeneratedTopics] = useState<TopicConcept[]>([]);
  const [generatedSubjectName, setGeneratedSubjectName] = useState<string | null>(null);
  const [isGeneratingTopics, setIsGeneratingTopics] = useState(false);
  const [creating, setCreating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [documentMessage, setDocumentMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [markingItem, setMarkingItem] = useState<number | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'in_progress' | 'planned' | 'completed'>('all');

  // Subject-first navigation state
  const [allSubjects, setAllSubjects] = useState<UserSubject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<UserSubject | null>(null);
  const [subjectTopics, setSubjectTopics] = useState<SubjectTopic[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingSubjectTopics, setLoadingSubjectTopics] = useState(false);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilterTab, setSubjectFilterTab] = useState<'all' | 'in_progress' | 'planned' | 'completed'>('all');
  const [topicFilterTab, setTopicFilterTab] = useState<'all' | 'in_progress' | 'planned' | 'completed'>('all');
  const navigate = useNavigate();

  // Fetch all user subjects on mount
  useEffect(() => {
    loadSubjects();
  }, []);

  const loadSubjects = async () => {
    setLoadingSubjects(true);
    setSubjectsError(null);
    try {
      const response = await getUserSubjects();
      setAllSubjects(response.subjects || []);
    } catch (err: any) {
      console.error('Failed to load user subjects:', err);
      setSubjectsError('Failed to load subjects. Please try again.');
    } finally {
      setLoadingSubjects(false);
    }
  };

  const loadSubjectTopics = async (subjectId: number) => {
    setLoadingSubjectTopics(true);
    try {
      const response = await getSubjectTopics(subjectId);
      setSubjectTopics(response.topics || []);
    } catch (err: any) {
      console.error('Failed to load subject topics:', err);
      setDocumentMessage({ type: 'error', text: 'Failed to load topics for this subject.' });
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

  const handleMarkItemStatus = async (itemId: number, newStatus: 'pending' | 'in_progress' | 'done' | 'skipped') => {
    setMarkingItem(itemId);
    try {
      await updatePlanItemStatus(itemId, newStatus);
      await refetch();
      // Reload subjects to update progress
      await loadSubjects();
      // Reload subject topics if one is selected
      if (selectedSubject) {
        await loadSubjectTopics(selectedSubject.id);
      }
    } catch {
      setDocumentMessage({ type: 'error', text: 'Failed to update topic status.' });
    } finally {
      setMarkingItem(null);
    }
  };

  const handleStartStudy = async (item: PlanItemOut) => {
    try {
      if (item.status !== 'in_progress') {
        await updatePlanItemStatus(item.id, 'in_progress');
      }
      navigate('/session');
    } catch {
      navigate('/session');
    }
  };

  const handleGenerateTopics = async () => {
    if (!rawTopicsText.trim()) return;
    setIsGeneratingTopics(true);
    setDocumentMessage(null);
    try {
      const res = await breakdownTopics(rawTopicsText.trim());
      const topics = res.topics || [];
      const subjectName = res.subject_name || null;
      
      setGeneratedTopics(topics);
      setGeneratedSubjectName(subjectName);
      
      if (topics.length === 0) {
        setDocumentMessage({ type: 'error', text: 'No topics could be extracted. Please enter more specific subject details.' });
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message || 'We could not generate your study plan right now. Please try again.';
      setDocumentMessage({ type: 'error', text: detail });
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
        subject_name: generatedSubjectName || undefined,
      };
      await createPlan(planData);
      setRawTopicsText('');
      setGeneratedTopics([]);
      setGeneratedSubjectName(null);
      setShowCreateForm(false);
      setDocumentMessage({ type: 'success', text: 'Study plan created successfully.' });
      // Reload subjects after creating plan
      await loadSubjects();
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

  const items: PlanItemOut[] = plan?.items || [];
  const inProgressItems = items.filter((i) => i.status === 'in_progress');
  const plannedItems = items.filter((i) => i.status === 'pending');
  const completedItems = items.filter((i) => i.status === 'done');
  const doneCount = completedItems.length;
  const progressPct = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;
  const totalDuration = items.reduce((acc, curr) => acc + (curr.duration_minutes || 0), 0);

  // Filter subjects based on search query and filter tab
  let filteredSubjects = searchQuery.trim()
    ? allSubjects.filter(subject =>
        subject.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allSubjects;

  // Apply subject filter tab
  if (subjectFilterTab === 'in_progress') {
    filteredSubjects = filteredSubjects.filter(s => s.in_progress_topics > 0);
  } else if (subjectFilterTab === 'planned') {
    filteredSubjects = filteredSubjects.filter(s => s.planned_topics > 0);
  } else if (subjectFilterTab === 'completed') {
    filteredSubjects = filteredSubjects.filter(s => s.completed_topics > 0 && s.completed_topics === s.total_topics);
  }

  // Calculate stats from all subjects
  const totalTopicsCount = allSubjects.reduce((acc, s) => acc + s.total_topics, 0);
  const inProgressTopicsCount = allSubjects.reduce((acc, s) => acc + s.in_progress_topics, 0);
  const plannedTopicsCount = allSubjects.reduce((acc, s) => acc + s.planned_topics, 0);
  const completedTopicsCount = allSubjects.reduce((acc, s) => acc + s.completed_topics, 0);

  const displayedItems = filterTab === 'all'
    ? items
    : filterTab === 'in_progress'
    ? inProgressItems
    : filterTab === 'planned'
    ? plannedItems
    : completedItems;

  return (
    <div className="space-y-8">
      {/* Top Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Study Planner
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track planned, in-progress, and completed topics with automatic progress synchronization.
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
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-center justify-between ${documentMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          <span>{documentMessage.text}</span>
          <button onClick={() => setDocumentMessage(null)} className="text-xs font-bold opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Overview Stats - Based on ALL subjects */}
      {(hasPlan || allSubjects.length > 0) && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Topics</p>
                <p className="text-xl font-extrabold text-slate-900">{totalTopicsCount}</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <span className="text-base font-black">◉</span>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">In Progress</p>
                <p className="text-xl font-extrabold text-amber-600">{inProgressTopicsCount}</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <span className="text-base font-black">✓</span>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Completed</p>
                <p className="text-xl font-extrabold text-emerald-600">{completedTopicsCount}</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
                <span className="text-base font-black">○</span>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Planned</p>
                <p className="text-xl font-extrabold text-slate-700">{plannedTopicsCount}</p>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          {hasPlan && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-bold text-slate-800">Overall Study Plan Progress</span>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {completedItems.length} of {items.length} topics finished · {totalDuration} total minutes
                  </p>
                </div>
                <span className="text-lg font-black text-indigo-600">{progressPct}%</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-3 bg-gradient-to-r from-indigo-500 via-amber-500 to-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Creation Modal / Form */}
      {showCreateForm && (
        <div className="bg-white rounded-2xl shadow-lg border border-indigo-100 p-6 sm:p-8 transition-all animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Create Study Plan</h2>
              <p className="text-xs text-slate-500">Enter what you want to study. Our AI will clean, organize, and structure the topics.</p>
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
                What do you want to study?
              </label>
              <textarea
                required
                value={rawTopicsText}
                onChange={(e) => setRawTopicsText(e.target.value)}
                placeholder="e.g. I want to learn machine learning from basics to advanced, covering supervised learning, linear regression, gradient descent..."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm h-32"
              />
              <button
                type="button"
                onClick={handleGenerateTopics}
                disabled={isGeneratingTopics || !rawTopicsText.trim()}
                className="mt-2.5 px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-2"
              >
                {isGeneratingTopics ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analyzing & Structuring Topics...
                  </>
                ) : (
                  'Generate Clean Topics'
                )}
              </button>
            </div>

            {generatedTopics.length > 0 && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                    Generated Clean Topics ({generatedTopics.length})
                  </p>
                  <span className="text-xs font-medium text-slate-500">Auto-normalized</span>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {generatedTopics.map((topic, i) => (
                    <div key={i} className="flex justify-between items-center text-sm bg-white px-3 py-2.5 rounded-xl border border-indigo-100 shadow-2xs">
                      <span className="font-semibold text-slate-800">{topic.topic_name}</span>
                      <span className="text-indigo-600 font-bold text-xs">{topic.duration_minutes} min</span>
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
                disabled={creating || generatedTopics.length === 0}
                className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all cursor-pointer"
              >
                {creating ? 'Saving Plan...' : 'Confirm & Save Plan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Subjects View - Level 1 */}
      {!selectedSubject && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Header & Search */}
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div className="flex items-center gap-3">
                <h2 className="font-extrabold text-slate-900 text-base">My Subjects</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold">
                  {allSubjects.length} total
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search subjects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48 sm:w-64"
                />
                <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Subject Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-200/60 p-1 rounded-xl text-xs font-bold self-start">
              <button
                onClick={() => setSubjectFilterTab('all')}
                className={`px-3 py-1.5 rounded-lg transition-all ${subjectFilterTab === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                All ({allSubjects.length})
              </button>
              <button
                onClick={() => setSubjectFilterTab('in_progress')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${subjectFilterTab === 'in_progress' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span>◉</span> In Progress ({allSubjects.filter(s => s.in_progress_topics > 0).length})
              </button>
              <button
                onClick={() => setSubjectFilterTab('planned')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${subjectFilterTab === 'planned' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span>○</span> Planned ({allSubjects.filter(s => s.planned_topics > 0).length})
              </button>
              <button
                onClick={() => setSubjectFilterTab('completed')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${subjectFilterTab === 'completed' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span>✓</span> Completed ({allSubjects.filter(s => s.completed_topics > 0 && s.completed_topics === s.total_topics).length})
              </button>
            </div>
          </div>

          {/* Subjects Grid */}
          {loadingSubjects ? (
            <div className="p-12 text-center text-slate-500">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-indigo-600 mx-auto mb-3"></div>
              <p className="text-sm font-medium">Loading your subjects...</p>
            </div>
          ) : subjectsError ? (
            <div className="p-12 text-center">
              <p className="text-sm text-red-600 font-medium mb-3">{subjectsError}</p>
              <button
                onClick={loadSubjects}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all"
              >
                Retry
              </button>
            </div>
          ) : filteredSubjects.length > 0 ? (
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSubjects.map((subject) => (
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
              <p className="text-sm font-semibold">
                {searchQuery ? `No subjects match "${searchQuery}"` : 'No subjects found'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Subject Topics View - Level 2 */}
      {selectedSubject && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Header & Back Button */}
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleBackToSubjects}
                  className="p-2 rounded-lg hover:bg-slate-200 transition-all text-slate-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div>
                  <h2 className="font-extrabold text-slate-900 text-lg">{selectedSubject.name}</h2>
                  <p className="text-xs text-slate-500">{subjectTopics.length} topics</p>
                </div>
              </div>
            </div>

            {/* Topic Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-200/60 p-1 rounded-xl text-xs font-bold self-start">
              <button
                onClick={() => setTopicFilterTab('all')}
                className={`px-3 py-1.5 rounded-lg transition-all ${topicFilterTab === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                All ({subjectTopics.length})
              </button>
              <button
                onClick={() => setTopicFilterTab('in_progress')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${topicFilterTab === 'in_progress' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span>◉</span> In Progress ({subjectTopics.filter(t => t.status === 'in_progress').length})
              </button>
              <button
                onClick={() => setTopicFilterTab('planned')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${topicFilterTab === 'planned' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span>○</span> Planned ({subjectTopics.filter(t => t.status === 'pending').length})
              </button>
              <button
                onClick={() => setTopicFilterTab('completed')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${topicFilterTab === 'completed' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span>✓</span> Completed ({subjectTopics.filter(t => t.status === 'done').length})
              </button>
            </div>
          </div>

          {/* Topics Grid */}
          {loadingSubjectTopics ? (
            <div className="p-12 text-center text-slate-500">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-300 border-t-indigo-600 mx-auto mb-3"></div>
              <p className="text-sm font-medium">Loading topics...</p>
            </div>
          ) : (() => {
            // Filter topics based on topic filter tab
            let filteredTopics = subjectTopics;
            if (topicFilterTab === 'in_progress') {
              filteredTopics = subjectTopics.filter(t => t.status === 'in_progress');
            } else if (topicFilterTab === 'planned') {
              filteredTopics = subjectTopics.filter(t => t.status === 'pending');
            } else if (topicFilterTab === 'completed') {
              filteredTopics = subjectTopics.filter(t => t.status === 'done');
            }

            return filteredTopics.length > 0 ? (
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTopics.map((topic) => {
                const isInProgress = topic.status === 'in_progress';
                const isDone = topic.status === 'done';
                const isPlanned = topic.status === 'pending';

                return (
                  <div
                    key={topic.id}
                    className={`rounded-xl border p-5 transition-all hover:shadow-md ${
                      isInProgress ? 'bg-amber-50 border-amber-300' :
                      isDone ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200'
                    }`}
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

                    <div className="flex items-center gap-2 pt-3 border-t border-slate-200/50">
                      {topic.item_id && (
                        <button
                          onClick={() => {
                            if (topic.status !== 'in_progress') {
                              updatePlanItemStatus(topic.item_id!, 'in_progress').then(() => {
                                loadSubjectTopics(selectedSubject.id);
                                refetch();
                              });
                            }
                            navigate('/session');
                          }}
                          className="flex-1 px-3 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all cursor-pointer"
                        >
                          Study
                        </button>
                      )}
                      <button
                        onClick={() => navigate('/quiz')}
                        className="flex-1 px-3 py-2 text-xs font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
                      >
                        Quiz
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            ) : (
              <div className="p-12 text-center text-slate-500">
                <p className="text-sm font-semibold">
                  {topicFilterTab === 'all' ? 'No topics found in this subject' : `No topics match the selected filter (${topicFilterTab})`}
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {/* Plan Items List with Clear State Categorization */}
      {hasPlan && plan ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Header & Controls */}
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <h2 className="font-extrabold text-slate-900 text-base">My Study Plan</h2>
              {plan.is_active ? (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Active Plan
                </span>
              ) : (
                <button
                  onClick={handleFinalizePlan}
                  disabled={finalizing}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-xs"
                >
                  {finalizing ? 'Activating...' : 'Set as Active Plan'}
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-200/60 p-1 rounded-xl text-xs font-bold">
              <button
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1.5 rounded-lg transition-all ${filterTab === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                All ({items.length})
              </button>
              <button
                onClick={() => setFilterTab('in_progress')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${filterTab === 'in_progress' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span>◉</span> In Progress ({inProgressItems.length})
              </button>
              <button
                onClick={() => setFilterTab('planned')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${filterTab === 'planned' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span>○</span> Planned ({plannedItems.length})
              </button>
              <button
                onClick={() => setFilterTab('completed')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${filterTab === 'completed' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                <span>✓</span> Completed ({completedItems.length})
              </button>
            </div>
          </div>

          {/* Items Display */}
          {displayedItems.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {displayedItems.map((item: PlanItemOut, idx: number) => {
                const currentTopicName = item.topic_name || `Topic #${item.topic_id}`;
                const isInProgress = item.status === 'in_progress';
                const isDone = item.status === 'done';
                const isPlanned = item.status === 'pending';

                return (
                  <div
                    key={item.id || idx}
                    className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                      isInProgress ? 'bg-amber-50/40 border-l-4 border-l-amber-500' :
                      isDone ? 'bg-emerald-50/20 hover:bg-emerald-50/40' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      {/* Visual status icon */}
                      {isDone ? (
                        <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-sm flex-shrink-0">
                          ✓
                        </div>
                      ) : isInProgress ? (
                        <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center font-black text-xs flex-shrink-0 animate-pulse">
                          ◉
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-semibold text-xs flex-shrink-0 border border-slate-200">
                          ○
                        </div>
                      )}

                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${isDone ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                            {currentTopicName}
                          </span>
                          {/* Distinct Status Badges */}
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
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                          <span>{item.duration_minutes} minutes</span>
                          <span>•</span>
                          <span>ID #{item.id}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* State transition triggers */}
                      {isPlanned && (
                        <>
                          <button
                            onClick={() => void handleStartStudy(item)}
                            className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            ▶ Study
                          </button>
                          <button
                            onClick={() => void handleMarkItemStatus(item.id, 'done')}
                            disabled={markingItem === item.id}
                            className="px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer"
                          >
                            {markingItem === item.id ? '...' : '✓ Done'}
                          </button>
                        </>
                      )}

                      {isInProgress && (
                        <>
                          <button
                            onClick={() => void handleStartStudy(item)}
                            className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            ▶ Resume Session
                          </button>
                          <button
                            onClick={() => void handleMarkItemStatus(item.id, 'done')}
                            disabled={markingItem === item.id}
                            className="px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs transition-all cursor-pointer"
                          >
                            {markingItem === item.id ? '...' : '✓ Finish'}
                          </button>
                          <button
                            onClick={() => void handleMarkItemStatus(item.id, 'pending')}
                            disabled={markingItem === item.id}
                            className="px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
                          >
                            Reset
                          </button>
                        </>
                      )}

                      {isDone && (
                        <button
                          onClick={() => void handleMarkItemStatus(item.id, 'pending')}
                          disabled={markingItem === item.id}
                          className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition-all cursor-pointer"
                        >
                          {markingItem === item.id ? '...' : 'Reopen Topic'}
                        </button>
                      )}

                      <button
                        onClick={() => navigate('/quiz')}
                        className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 transition-all cursor-pointer"
                      >
                        Quiz
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500">
              <p className="text-sm font-semibold">No topics match the selected tab filter ({filterTab}).</p>
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
          <h3 className="text-lg font-bold text-slate-900 mb-1.5">
            {allSubjects.length > 0 ? 'No Active Study Plan' : 'No Subjects Yet'}
          </h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
            {allSubjects.length > 0
              ? 'You have subjects but no active study plan. Create a plan to organize your study schedule.'
              : 'Enter what you want to study above, and our AI pipeline will create your organized, scheduled study plan.'}
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-600/20 active:scale-95 transition-all cursor-pointer"
          >
            {allSubjects.length > 0 ? 'Create Study Plan' : 'Create Your First Plan'}
          </button>
        </div>
      )}
    </div>
  );
};

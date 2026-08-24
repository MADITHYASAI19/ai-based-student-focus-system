import React, { useState } from 'react';
import { usePlan } from '../hooks/usePlan';
import type { StudyPlanCreate } from '../api/types';

export const PlannerPage: React.FC = () => {
  const { plan, loading, error, hasPlan, createPlan, userId } = usePlan();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [examDeadline, setExamDeadline] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    setCreating(true);
    try {
      // Create plan with empty items for now
      const planData: StudyPlanCreate = {
        student_id: userId,
        plan_items: [],
      };
      await createPlan(planData);
      setShowCreateForm(false);
      setExamDeadline('');
    } catch (err) {
      console.error('Failed to create plan:', err);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Study Planner</h1>
          {!hasPlan && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
            >
              Create Plan
            </button>
          )}
        </div>

        {showCreateForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Create Study Plan</h2>
            <form onSubmit={handleCreatePlan}>
              <div className="mb-4">
                <label htmlFor="examDeadline" className="block text-sm font-medium text-gray-700 mb-2">
                  Exam Deadline (Optional)
                </label>
                <input
                  id="examDeadline"
                  type="date"
                  value={examDeadline}
                  onChange={(e) => setExamDeadline(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Plan'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {hasPlan && plan ? (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Your Study Plan</h2>
            {plan.plan_items.length > 0 ? (
              <div className="space-y-3">
                {plan.plan_items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-md"
                  >
                    <div>
                      <p className="font-medium text-gray-900">Topic ID: {item.topic_id}</p>
                      <p className="text-sm text-gray-600">
                        Due: {new Date(item.target_date).toLocaleDateString()}
                      </p>
                      <p className="text-sm text-gray-600">
                        Priority: {item.priority}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          item.completed
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {item.completed ? 'Completed' : 'In Progress'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No study items in your plan yet.</p>
                <p className="text-sm mt-2">Topics will be added automatically in future updates.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <div className="text-gray-400 mb-4">
              <svg
                className="mx-auto h-12 w-12"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No study plan yet</h3>
            <p className="text-gray-500 mb-6">Create one to start organizing your study schedule</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700"
            >
              Create Plan
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

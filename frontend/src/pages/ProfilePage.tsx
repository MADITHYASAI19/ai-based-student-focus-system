import React, { useEffect, useState } from 'react';
import { getProfile } from '../api/client';
import type { Profile } from '../api/types';

export const ProfilePage: React.FC = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getProfile()
      .then(setProfile)
      .catch(() => setError('Unable to load your learning profile.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="py-24 text-center text-sm font-medium text-slate-500">Loading your profile...</div>;
  }

  if (error || !profile) {
    return <div className="max-w-xl mx-auto p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm text-center">{error}</div>;
  }

  const firstName = profile.user.name.split(' ')[0];
  const initials = profile.user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const metrics = [
    ['Profile score', `${profile.profile_score}%`, 'Your combined learning progress'],
    ['Focus score', profile.focus_score == null ? '--' : `${profile.focus_score}%`, 'Average completed-session focus'],
    ['Quiz average', profile.quiz_average == null ? '--' : `${profile.quiz_average}%`, `${profile.quiz_attempts} quiz attempts`],
    ['Study time', `${profile.total_study_minutes} min`, `${profile.completed_sessions} completed sessions`],
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="h-28 bg-gradient-to-r from-slate-950 via-indigo-950 to-indigo-700" />
        <div className="px-6 sm:px-8 pb-7">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 -mt-10">
            <div className="flex items-end gap-4">
              <div className="w-20 h-20 rounded-2xl bg-indigo-600 border-4 border-white text-white flex items-center justify-center text-2xl font-extrabold shadow-lg">
                {initials}
              </div>
              <div className="pb-1">
                <h1 className="text-2xl font-extrabold text-slate-900">{profile.user.name}</h1>
                <p className="text-sm text-slate-500">{profile.user.email}</p>
              </div>
            </div>
            <span className="self-start sm:self-auto mb-1 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-xs font-bold uppercase tracking-wider text-indigo-700">
              {profile.user.role}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-6">Welcome back, {firstName}. Here is your complete learning snapshot.</p>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map(([label, value, detail]) => (
          <div key={label} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="text-3xl font-extrabold text-slate-900 mt-3">{value}</p>
            <p className="text-xs text-slate-500 mt-2">{detail}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Learning progress</h2>
              <p className="text-sm text-slate-500 mt-1">How much of your planned work is complete.</p>
            </div>
            <span className="text-lg font-extrabold text-indigo-600">{profile.plan_completion}%</span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${Math.min(profile.plan_completion, 100)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-3">
            <span>Planned work</span>
            <span>Completed</span>
          </div>
        </div>

        <div className="bg-slate-950 text-white rounded-2xl p-6 shadow-sm">
          <p className="text-xs uppercase tracking-[0.18em] text-indigo-300 font-bold">Your momentum</p>
          <p className="text-3xl font-extrabold mt-3">{profile.learned_topics.length}</p>
          <p className="text-sm text-slate-300 mt-1">topics recorded as learned</p>
          <p className="text-xs text-slate-400 mt-6">Keep completing planned topics and focus sessions to grow your profile score.</p>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Everything you have learned</h2>
            <p className="text-sm text-slate-500 mt-1">Completed topics from your study activity.</p>
          </div>
          <span className="text-sm font-bold text-indigo-600">{profile.learned_topics.length} total</span>
        </div>
        {profile.learned_topics.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {profile.learned_topics.map((topic) => (
              <div key={topic.id} className="flex items-center justify-between gap-4 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                <div>
                  <p className="font-bold text-slate-900">{topic.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{topic.subject} · {topic.difficulty} level</p>
                </div>
                <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">✓</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-slate-300 rounded-xl p-8 text-center">
            <p className="font-semibold text-slate-700">No learned topics yet</p>
            <p className="text-sm text-slate-500 mt-1">Complete a topic in your study planner to see it here.</p>
          </div>
        )}
      </section>
    </div>
  );
};

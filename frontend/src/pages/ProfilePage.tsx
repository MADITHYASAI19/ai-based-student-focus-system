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
    return <div className="py-24 text-center text-sm font-medium text-[#566478]">Loading your profile...</div>;
  }

  if (error || !profile) {
    return <div className="max-w-xl mx-auto p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm text-center">{error}</div>;
  }

  const initials = profile.user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const metrics = [
    ['Profile score', `${profile.profile_score}%`, 'Combined learning progress'],
    ['Focus score', profile.focus_score == null ? '--' : `${profile.focus_score}%`, 'Average session focus'],
    ['Quiz average', profile.quiz_average == null ? '--' : `${profile.quiz_average}%`, `${profile.quiz_attempts} quiz attempts`],
    ['Study time', `${profile.total_study_minutes} min`, `${profile.completed_sessions} completed sessions`],
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Profile Card */}
      <section className="bg-white border border-[#e6eaf0] rounded-2xl shadow-sm overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-[#e8f1fc] to-[#fff1e4]" />
        <div className="px-6 sm:px-8 pb-7">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 -mt-10">
            <div className="flex items-end gap-4">
              <div className="w-17 h-17 rounded-2xl bg-[#24425f] border-4 border-white text-white flex items-center justify-center text-3xl font-extrabold shadow-lg" style={{ width: '68px', height: '68px' }}>
                {initials}
              </div>
              <div className="pb-1">
                <h1 className="text-2xl font-extrabold text-[#16253b]">{profile.user.name}</h1>
                <p className="text-sm text-[#566478]">{profile.user.email}</p>
              </div>
            </div>
            <span className="self-start sm:self-auto mb-1 px-3 py-1 rounded-full bg-[#eef2f6] border border-[#e6eaf0] text-xs font-bold uppercase tracking-wider text-[#566478]">
              {profile.user.role}
            </span>
          </div>
          <p className="text-sm text-[#566478] mt-6">Welcome back. Here is your learning snapshot.</p>
        </div>
      </section>

      {/* Metrics Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {metrics.map(([label, value, detail]) => (
          <div key={label} className="bg-white border border-[#e6eaf0] rounded-2xl p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-[#566478]">{label}</p>
            <p className="text-3xl font-extrabold text-[#16253b] mt-3">{value}</p>
            <p className="text-xs text-[#566478] mt-2">{detail}</p>
          </div>
        ))}
      </section>

      {/* Progress & Momentum */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-3.5">
        <div className="bg-white border border-[#e6eaf0] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-bold text-[#16253b]">Learning progress</h2>
              <p className="text-sm text-[#566478] mt-1">How much of your planned work is complete.</p>
            </div>
            <span className="text-lg font-extrabold text-[#24425f]">{profile.plan_completion}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#e6eaf0] overflow-hidden">
            <div className="h-full rounded-full bg-[#24425f] transition-all" style={{ width: `${Math.min(profile.plan_completion, 100)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-[#566478] mt-3">
            <span>Planned work</span>
            <span>Completed</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#1d3a5a] to-[#2e4a67] text-white rounded-2xl p-6 shadow-sm border border-transparent">
          <p className="text-xs uppercase tracking-[0.18em] text-white/80 font-bold">Your momentum</p>
          <p className="text-4xl font-extrabold mt-3">{profile.learned_topics.length}</p>
          <p className="text-sm text-white/90 mt-1">topics learned. Keep going to grow your profile score.</p>
        </div>
      </section>

      {/* Learned Topics */}
      <section className="bg-white border border-[#e6eaf0] rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-bold text-[#16253b]">Everything you have learned</h2>
            <p className="text-sm text-[#566478] mt-1">Completed topics from your study activity.</p>
          </div>
          <span className="text-sm font-bold text-[#24425f]">{profile.learned_topics.length} total</span>
        </div>
        {profile.learned_topics.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {profile.learned_topics.map((topic) => (
              <div key={topic.id} className="flex items-center justify-between gap-4 rounded-xl border border-[#c3ebd3] bg-[#e5f8ed] px-4 py-3">
                <div>
                  <p className="font-bold text-[#16253b]">{topic.name}</p>
                  <p className="text-xs text-[#566478] mt-1">{topic.subject} · {topic.difficulty}</p>
                </div>
                <span className="w-7 h-7 rounded-full bg-[#138a5e] text-white flex items-center justify-center font-bold">✓</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-[#e6eaf0] rounded-xl p-8 text-center">
            <p className="font-semibold text-[#16253b]">No learned topics yet</p>
            <p className="text-sm text-[#566478] mt-1">Complete a topic in your study planner to see it here.</p>
          </div>
        )}
      </section>
    </div>
  );
};

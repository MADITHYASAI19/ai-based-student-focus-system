import React, { useState } from 'react';
import { getQuiz, submitQuizAttempt } from '../api/client';
import type { QuizOut, QuizAttemptOut } from '../api/types';

interface PresetTopic {
  id: number;
  name: string;
  subject: string;
}

const PRESET_TOPICS: PresetTopic[] = [
  { id: 1, name: 'Binary Search Trees', subject: 'Computer Science' },
  { id: 4, name: 'Quadratic Equations', subject: 'Mathematics' },
  { id: 5, name: 'Cell Structure & Mitochondria', subject: 'Biology' },
];

export const QuizPage: React.FC = () => {
  const [selectedTopicId, setSelectedTopicId] = useState<number>(1);
  const [customTopicId, setCustomTopicId] = useState<string>('');
  const [useCustomTopic, setUseCustomTopic] = useState<boolean>(false);
  const [difficulty, setDifficulty] = useState<string>('medium');
  const [quiz, setQuiz] = useState<QuizOut | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attemptResult, setAttemptResult] = useState<QuizAttemptOut | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveTopicId = useCustomTopic && customTopicId ? Number(customTopicId) : selectedTopicId;

  const handleFetchQuiz = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    setAttemptResult(null);
    setAnswers({});

    try {
      const data = await getQuiz(effectiveTopicId, difficulty);
      setQuiz(data);
    } catch (err: any) {
      console.error('Failed to fetch quiz:', err);
      setError(err.response?.data?.detail || 'Failed to load quiz. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAnswer = (questionIndex: number, answer: string) => {
    setAnswers((prev) => ({
      ...prev,
      [String(questionIndex)]: answer,
    }));
  };

  const handleSubmitAttempt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quiz || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await submitQuizAttempt(quiz.topic_id, { answers });
      setAttemptResult(result);
    } catch (err: any) {
      console.error('Failed to submit quiz attempt:', err);
      setError(err.response?.data?.detail || 'Failed to submit quiz attempt.');
    } finally {
      setSubmitting(false);
    }
  };

  const questions = quiz?.questions || [];
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          AI Adaptive Quizzes
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Generate questions on the fly powered by Groq LLM and verified via server-side grading.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Quiz Generator Controls */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          Configure Your Quiz
        </h2>

        {/* Topic Selector Chips */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            1. Select Subject Topic
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {PRESET_TOPICS.map((topic) => {
              const isSelected = !useCustomTopic && selectedTopicId === topic.id;
              return (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => {
                    setSelectedTopicId(topic.id);
                    setUseCustomTopic(false);
                  }}
                  className={`p-3.5 rounded-xl text-left border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <p className="text-xs font-semibold text-indigo-600">{topic.subject}</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{topic.name}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Difficulty Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            2. Choose Difficulty Level
          </label>
          <div className="flex items-center gap-3">
            {(['easy', 'medium', 'hard'] as const).map((diff) => {
              const isSelected = difficulty === diff;
              return (
                <button
                  key={diff}
                  type="button"
                  onClick={() => setDifficulty(diff)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                    isSelected
                      ? diff === 'easy'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                        : diff === 'medium'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                        : 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {diff}
                </button>
              );
            })}
          </div>
        </div>

        {/* Generate Button */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setUseCustomTopic(!useCustomTopic)}
            className="text-xs text-slate-500 hover:text-indigo-600 underline"
          >
            {useCustomTopic ? 'Use preset topics' : 'Or enter custom Topic ID'}
          </button>

          {useCustomTopic && (
            <input
              type="number"
              min="1"
              placeholder="Topic ID #"
              value={customTopicId}
              onChange={(e) => setCustomTopicId(e.target.value)}
              className="w-28 px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            />
          )}

          <button
            type="button"
            onClick={() => handleFetchQuiz()}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-2"
          >
            {loading ? (
              <span>Generating with AI...</span>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate Quiz Questions
              </>
            )}
          </button>
        </div>
      </div>

      {/* Attempt Result Banner (if scored) */}
      {attemptResult && (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20 animate-in fade-in flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-white/20 text-white">
              Server-Verified Attempt #{attemptResult.id}
            </span>
            <h3 className="text-2xl font-black tracking-tight mt-1">
              Your Score: {attemptResult.score.toFixed(1)}%
            </h3>
            <p className="text-xs text-white/80 mt-0.5">
              Completed at {new Date(attemptResult.completed_at || Date.now()).toLocaleTimeString()} • Attempt recorded in database.
            </p>
          </div>
          <button
            onClick={() => handleFetchQuiz()}
            className="px-4 py-2 rounded-xl bg-white text-emerald-800 font-bold text-xs hover:bg-slate-100 transition-all cursor-pointer whitespace-nowrap"
          >
            Retake / New Questions
          </button>
        </div>
      )}

      {/* Questions Form */}
      {quiz && questions.length > 0 && (
        <form onSubmit={handleSubmitAttempt} className="space-y-6">
          <div className="flex items-center justify-between px-2">
            <span className="text-sm font-bold text-slate-800">
              Questions ({answeredCount} of {questions.length} answered)
            </span>
            <span className="text-xs font-semibold text-indigo-600 capitalize bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
              Topic: {quiz.topic_id} • {quiz.difficulty}
            </span>
          </div>

          <div className="space-y-4">
            {questions.map((q, qIndex) => {
              const selectedAnswer = answers[String(qIndex)];

              return (
                <div
                  key={qIndex}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 space-y-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                      {qIndex + 1}
                    </span>
                    <h3 className="font-semibold text-slate-900 text-base leading-snug">
                      {q.question_text}
                    </h3>
                  </div>

                  {/* Multiple Choice Options */}
                  {q.type === 'mcq' && q.options && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                      {q.options.map((option, optIndex) => {
                        const isChosen = selectedAnswer === option;
                        const optionLetters = ['A', 'B', 'C', 'D'];
                        const letter = optionLetters[optIndex] || `${optIndex + 1}`;

                        return (
                          <button
                            key={optIndex}
                            type="button"
                            onClick={() => handleSelectAnswer(qIndex, option)}
                            className={`flex items-center gap-3 p-3.5 rounded-xl border text-left text-sm transition-all cursor-pointer ${
                              isChosen
                                ? 'bg-indigo-50/90 border-indigo-600 font-semibold text-indigo-950 shadow-xs ring-2 ring-indigo-500/20'
                                : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-100/80 text-slate-700'
                            }`}
                          >
                            <span
                              className={`w-6 h-6 rounded-md text-xs font-bold flex items-center justify-center ${
                                isChosen
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-white text-slate-500 border border-slate-300'
                              }`}
                            >
                              {letter}
                            </span>
                            <span className="flex-1">{option}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Short Answer Input */}
                  {q.type === 'short_answer' && (
                    <div className="pt-2">
                      <textarea
                        rows={3}
                        placeholder="Type your explanation or answer..."
                        value={selectedAnswer || ''}
                        onChange={(e) => handleSelectAnswer(qIndex, e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Submit Action */}
          <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200/90 shadow-xl flex items-center justify-between gap-4">
            <span className="text-xs text-slate-500">
              {answeredCount === questions.length ? (
                <span className="text-emerald-600 font-semibold">✓ All questions answered</span>
              ) : (
                <span>{questions.length - answeredCount} questions remaining</span>
              )}
            </span>

            <button
              type="submit"
              disabled={submitting || answeredCount === 0}
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-600/25 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-2"
            >
              {submitting ? 'Submitting & Scoring...' : 'Submit Answers for Grading'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

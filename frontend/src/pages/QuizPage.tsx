import React, { useState } from 'react';
import { getQuiz, submitQuizAttempt } from '../api/client';
import type { QuizOut, QuizAttemptOut } from '../api/types';

export const QuizPage: React.FC = () => {
  const [topicId, setTopicId] = useState<number>(1);
  const [difficulty, setDifficulty] = useState<string>('easy');
  const [quiz, setQuiz] = useState<QuizOut | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attemptResult, setAttemptResult] = useState<QuizAttemptOut | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetchQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setAttemptResult(null);
    setAnswers({});

    try {
      const data = await getQuiz(topicId, difficulty);
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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">AI Practice Quiz</h1>
          <p className="text-sm text-gray-500 mt-1">
            Test your knowledge with AI-generated questions and server-verified scoring
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}

        {/* Quiz Config Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <form onSubmit={handleFetchQuiz} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="topicId" className="block text-sm font-medium text-gray-700 mb-1">
                Topic ID
              </label>
              <input
                id="topicId"
                type="number"
                min="1"
                value={topicId}
                onChange={(e) => setTopicId(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                disabled={loading || submitting}
              />
            </div>
            <div>
              <label htmlFor="difficulty" className="block text-sm font-medium text-gray-700 mb-1">
                Difficulty
              </label>
              <select
                id="difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                disabled={loading || submitting}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={loading || submitting}
                className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <span>Loading Quiz...</span>
                  </>
                ) : (
                  'Start Quiz'
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Quiz Questions List */}
        {quiz && (
          <form onSubmit={handleSubmitAttempt} className="space-y-6">
            {quiz.questions.map((q, idx) => (
              <div
                key={idx}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4"
              >
                <div className="flex items-start gap-3">
                  <span className="bg-indigo-100 text-indigo-800 text-xs font-semibold px-2.5 py-1 rounded-full">
                    Q{idx + 1}
                  </span>
                  <p className="text-gray-900 font-medium leading-relaxed">{q.question_text}</p>
                </div>

                {/* Options */}
                {q.options && q.options.length > 0 ? (
                  <div className="space-y-2 mt-2">
                    {q.options.map((opt, optIdx) => {
                      const isSelected = answers[String(idx)] === opt;
                      return (
                        <label
                          key={optIdx}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors text-sm ${
                            isSelected
                              ? 'bg-indigo-50 border-indigo-400 text-indigo-900 font-medium'
                              : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`question-${idx}`}
                            value={opt}
                            checked={isSelected}
                            onChange={() => handleSelectAnswer(idx, opt)}
                            disabled={submitting || !!attemptResult}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-2">
                    <input
                      type="text"
                      placeholder="Type your short answer..."
                      value={answers[String(idx)] || ''}
                      onChange={(e) => handleSelectAnswer(idx, e.target.value)}
                      disabled={submitting || !!attemptResult}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                    />
                  </div>
                )}
              </div>
            ))}

            {/* Score Display Card (Server-Graded) */}
            {attemptResult && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center shadow-sm">
                <h3 className="text-xl font-bold text-emerald-900 mb-1">Quiz Completed!</h3>
                <p className="text-sm text-emerald-700 mb-4">
                  Graded server-side and recorded to your account (Attempt #{attemptResult.id})
                </p>
                <div className="text-5xl font-extrabold text-emerald-600 mb-2">
                  {attemptResult.score.toFixed(1)}%
                </div>
                <p className="text-xs text-emerald-600">
                  Completed at:{' '}
                  {attemptResult.completed_at
                    ? new Date(attemptResult.completed_at).toLocaleString()
                    : 'Just now'}
                </p>
              </div>
            )}

            {/* Submit Quiz Attempt Button */}
            {!attemptResult && (
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={submitting || Object.keys(answers).length === 0}
                  className="bg-indigo-600 text-white py-3 px-8 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 shadow-sm flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      <span>Submitting & Scoring...</span>
                    </>
                  ) : (
                    'Submit Quiz Answers'
                  )}
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
};

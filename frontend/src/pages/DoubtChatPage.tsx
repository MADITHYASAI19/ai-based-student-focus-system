import React, { useState } from 'react';
import { askDoubt } from '../api/client';
import type { DoubtAnswer } from '../api/types';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  subjectName: string;
  confidence?: 'high' | 'low';
  sourceChunks?: string[];
  timestamp: Date;
}

const AVAILABLE_SUBJECTS = [
  { id: 1, name: 'Mathematics' },
  { id: 4, name: 'Biology' },
];

export const DoubtChatPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<number>(AVAILABLE_SUBJECTS[0].id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAskDoubt = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || loading) return;

    const currentSubject = AVAILABLE_SUBJECTS.find((s) => s.id === selectedSubjectId);
    const subjectName = currentSubject ? currentSubject.name : `Subject #${selectedSubjectId}`;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: trimmedQuestion,
      subjectName,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuestion('');
    setError(null);
    setLoading(true);

    try {
      const response: DoubtAnswer = await askDoubt({
        question: trimmedQuestion,
        subject_id: selectedSubjectId,
      });

      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: response.answer_text,
        subjectName,
        confidence: response.confidence,
        sourceChunks: response.source_chunk_ids,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (err: any) {
      console.error('Failed to resolve doubt:', err);
      const errorMessage =
        err.response?.data?.detail?.message ||
        (typeof err.response?.data?.detail === 'string'
          ? err.response.data.detail
          : 'Failed to resolve your doubt. Please try again.');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="bg-white rounded-t-xl shadow-sm border-b border-gray-200 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Doubt Solver</h1>
            <p className="text-sm text-gray-500">
              Ask questions grounded in your course materials and notes
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="subject-select" className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Subject:
            </label>
            <select
              id="subject-select"
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(Number(e.target.value))}
              disabled={loading}
              className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {AVAILABLE_SUBJECTS.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Message List */}
        <div className="flex-1 bg-white p-6 overflow-y-auto space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-12">
              <svg
                className="w-16 h-16 mb-4 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
              <h3 className="text-lg font-medium text-gray-700">No questions asked yet</h3>
              <p className="text-sm text-gray-500 max-w-sm mt-1">
                Select your subject above, type your query, and our AI will retrieve answers cited directly from course notes.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                {/* Message Header */}
                <div className="flex items-center gap-2 mb-1 px-1 text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">
                    {msg.sender === 'user' ? 'You' : 'AI Study Assistant'}
                  </span>
                  <span>•</span>
                  <span>{msg.subjectName}</span>
                  <span>•</span>
                  <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                {/* User Message Bubble */}
                {msg.sender === 'user' ? (
                  <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-none px-4 py-3 max-w-xl text-sm shadow-sm whitespace-pre-wrap">
                    {msg.text}
                  </div>
                ) : (
                  /* AI Answer Card */
                  <div
                    className={`max-w-2xl rounded-2xl rounded-tl-none p-5 shadow-sm border ${
                      msg.confidence === 'high'
                        ? 'bg-slate-50/70 border-slate-200 text-gray-800'
                        : 'bg-amber-50/70 border-amber-200 text-amber-950'
                    }`}
                  >
                    {/* Confidence Badge */}
                    <div className="flex items-center justify-between gap-3 mb-2.5 pb-2 border-b border-gray-200/60">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            msg.confidence === 'high'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              msg.confidence === 'high' ? 'bg-emerald-600' : 'bg-amber-600'
                            }`}
                          />
                          {msg.confidence === 'high' ? 'High Confidence (Grounded)' : 'Low Confidence / Uncertain'}
                        </span>
                      </div>
                    </div>

                    {/* Answer Text */}
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
                      {msg.text}
                    </div>

                    {/* Source Citations for Grounded Answers */}
                    {msg.sourceChunks && msg.sourceChunks.length > 0 && (
                      <div className="mt-3.5 pt-2.5 border-t border-gray-200/70 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                        <span className="font-medium text-gray-600">Sources:</span>
                        {msg.sourceChunks.map((chunkId, idx) => (
                          <span
                            key={idx}
                            className="inline-block bg-white text-gray-600 px-2 py-0.5 rounded border border-gray-300 font-mono text-[11px]"
                          >
                            {chunkId}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          {/* Loading Indicator */}
          {loading && (
            <div className="flex flex-col items-start space-y-2">
              <div className="flex items-center gap-2 px-1 text-xs text-gray-500">
                <span className="font-semibold text-gray-700">AI Study Assistant</span>
                <span>•</span>
                <span>Searching knowledge base & synthesizing answer...</span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-none p-4 flex items-center gap-3 text-sm text-gray-600 shadow-sm">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-indigo-600 border-t-transparent"></div>
                <span>Retrieving course notes and reasoning...</span>
              </div>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="text-red-500 hover:text-red-700 font-bold ml-4"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Input Form */}
        <div className="bg-white rounded-b-xl shadow-sm border-t border-gray-200 p-4">
          <form onSubmit={handleAskDoubt} className="flex gap-3">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={loading}
              placeholder={
                loading
                  ? 'Waiting for AI response...'
                  : 'Ask a question (e.g. "What does the discriminant tell us about quadratic roots?")...'
              }
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Thinking...</span>
                </>
              ) : (
                'Ask Doubt'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

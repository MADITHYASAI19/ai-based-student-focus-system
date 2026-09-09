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

const AVAILABLE_TOPICS = [
  { id: 1, name: 'Binary Search Trees', subjectId: 1 },
  { id: 4, name: 'Quadratic Equations', subjectId: 1 },
  { id: 5, name: 'Cell Structure & Mitochondria', subjectId: 4 },
];

const SUGGESTED_QUESTIONS = [
  { text: 'What is the quadratic formula?', subjectId: 1 },
  { text: 'What does the discriminant tell us about quadratic roots?', subjectId: 1 },
  { text: 'What is the function of mitochondria in eukaryotic cells?', subjectId: 4 },
  { text: 'How do you bake a chocolate cake?', subjectId: 1, isOffTopic: true },
];

export const DoubtChatPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: "Hello! I'm your AI Study Companion tutor. Ask me any question grounded in your course notes, and I'll retrieve relevant references with verified confidence.",
      subjectName: 'All Subjects',
      confidence: 'high',
      timestamp: new Date(),
    },
  ]);
  const [question, setQuestion] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<number>(AVAILABLE_SUBJECTS[0].id);
  const [selectedTopicId, setSelectedTopicId] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAskDoubt = async (questionText: string, subjectId: number) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;

    const currentSubject = AVAILABLE_SUBJECTS.find((s) => s.id === subjectId);
    const subjectName = currentSubject ? currentSubject.name : `Subject #${subjectId}`;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: trimmed,
      subjectName,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuestion('');
    setError(null);
    setLoading(true);

    try {
      const response: DoubtAnswer = await askDoubt({
        question: trimmed,
        subject_id: subjectId,
        topic_id: selectedTopicId,
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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          AI Doubt Tutor (RAG)
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Ask questions grounded in indexed study notes. Filtered with cosine similarity guardrails to prevent hallucination.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Suggested Quick Questions */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
          💡 Try Sample Queries
        </p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setSelectedSubjectId(item.subjectId);
                handleAskDoubt(item.text, item.subjectId);
              }}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-700 hover:text-indigo-700 transition-colors cursor-pointer text-left"
            >
              {item.isOffTopic ? '⚠️ Off-Topic Guardrail: ' : ''}{item.text}
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages Stream */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs flex flex-col min-h-[480px]">
        {/* Subject Header */}
        <div className="px-6 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-semibold text-slate-700">RAG Knowledge Base Active</span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500">Subject Scope:</label>
            <select
              value={selectedSubjectId}
              onChange={(e) => {
                setSelectedSubjectId(Number(e.target.value));
                setSelectedTopicId(undefined);
              }}
              className="text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {AVAILABLE_SUBJECTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <label className="text-xs font-semibold text-slate-500">Topic:</label>
            <select
              value={selectedTopicId ?? ''}
              onChange={(e) => setSelectedTopicId(e.target.value ? Number(e.target.value) : undefined)}
              className="text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All subject notes</option>
              {AVAILABLE_TOPICS.filter((topic) => topic.subjectId === selectedSubjectId).map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Message Stream */}
        <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[520px]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'ai' && (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 mt-1 shadow-xs">
                  AI
                </div>
              )}

              <div
                className={`max-w-2xl rounded-2xl p-4 sm:p-5 text-sm ${
                  msg.sender === 'user'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/15'
                    : 'bg-slate-50 border border-slate-200/90 text-slate-800'
                }`}
              >
                {/* AI Metadata Tags */}
                {msg.sender === 'ai' && msg.id !== 'welcome' && (
                  <div className="flex flex-wrap items-center gap-2 mb-2 pb-2 border-b border-slate-200/60">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                        msg.confidence === 'high'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {msg.confidence === 'high' ? '✓ High Confidence Grounded' : '⚠️ Low Confidence / Guardrail Triggered'}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">Scope: {msg.subjectName}</span>
                  </div>
                )}

                {/* Body Text */}
                <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>

                {/* Sources Footer */}
                {msg.sourceChunks && msg.sourceChunks.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-200/60 flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-600">Retrieved Chunks:</span>
                    <div className="flex flex-wrap gap-1">
                      {msg.sourceChunks.map((chunkId, cIdx) => (
                        <span key={cIdx} className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] font-mono text-indigo-600">
                          {chunkId}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {msg.sender === 'user' && (
                <div className="w-8 h-8 rounded-xl bg-slate-800 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 mt-1 shadow-xs">
                  U
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 animate-pulse">
                AI
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-500 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-600 animate-ping"></div>
                Searching ChromaDB vector store and reasoning answer...
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-100 bg-white rounded-b-2xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAskDoubt(question, selectedSubjectId);
            }}
            className="flex items-center gap-3"
          >
            <input
              type="text"
              placeholder="Ask a question grounded in course notes..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={loading}
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>Send</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

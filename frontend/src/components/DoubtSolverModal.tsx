import React, { useState, useRef } from 'react';
import { askDoubt } from '../api/client';
import type { DoubtAnswer, AnswerSection } from '../api/types';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  confidence?: 'high' | 'low';
  sourceChunks?: string[];
  sections?: AnswerSection[];
  sourceType?: 'pdf' | 'ai' | 'mixed' | 'none';
  timestamp: Date;
  subjectContext?: string;
}

interface DoubtSolverModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicId?: number;
  topicName?: string;
  subjectId?: number;
  subjectName?: string;
}

export const DoubtSolverModal: React.FC<DoubtSolverModalProps> = ({
  isOpen,
  onClose,
  topicId,
  topicName,
  subjectId,
  subjectName,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: topicName 
        ? `Hello! I'm your AI tutor for ${topicName}. Ask me any question about this topic, and I'll help you understand it better.`
        : "Hello! I'm your AI Study Companion tutor. Ask me any question, and I'll provide answers grounded in your PDF notes when available, supplementing with general AI knowledge when needed.",
      subjectContext: subjectName || 'All Subjects',
      confidence: 'high',
      timestamp: new Date(),
    },
  ]);
  const [question, setQuestion] = useState('');
  const [sourceMode, setSourceMode] = useState<'pdf+ai' | 'pdf_only' | 'general_ai'>('pdf+ai');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleAskDoubt = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;

    const effectiveSubjectId = subjectId;
    const effectiveSourceMode = sourceMode;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: trimmed,
      subjectContext: subjectName || 'General',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuestion('');
    setError(null);
    setLoading(true);

    try {
      const history = messages
        .filter(m => m.id !== 'welcome')
        .slice(-5)
        .map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        }));

      const response: DoubtAnswer = await askDoubt({
        question: trimmed,
        subject_id: effectiveSubjectId,
        topic_id: topicId,
        source_mode: effectiveSourceMode,
        conversation_history: history,
      });

      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: response.answer_text,
        subjectContext: subjectName || 'General',
        confidence: response.confidence,
        sourceChunks: response.source_chunk_ids,
        sections: response.sections,
        sourceType: response.source_type,
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

  const renderSourceLabel = (sourceType?: 'pdf' | 'ai' | 'mixed' | 'none') => {
    switch (sourceType) {
      case 'pdf':
        return '📄 FROM YOUR PDF';
      case 'ai':
        return '🤖 GENERAL AI KNOWLEDGE';
      case 'mixed':
        return '📄 PDF + 🤖 AI KNOWLEDGE';
      case 'none':
        return '⚠️ NO RELEVANT CONTENT';
      default:
        return '';
    }
  };

  const renderSections = (sections?: AnswerSection[]) => {
    if (!sections || sections.length === 0) return null;

    return (
      <div className="mt-3 space-y-3">
        {sections.map((section, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-lg border ${
              section.type === 'pdf'
                ? 'bg-blue-50 border-blue-200'
                : section.type === 'ai'
                ? 'bg-purple-50 border-purple-200'
                : 'bg-indigo-50 border-indigo-200'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold uppercase">
                {section.type === 'pdf' ? '📄 FROM YOUR PDF' : section.type === 'ai' ? '🤖 ADDITIONAL AI KNOWLEDGE' : '📄 PDF + 🤖 AI'}
              </span>
            </div>
            <div className="text-sm whitespace-pre-wrap">{section.content}</div>
            {section.sources && section.sources.length > 0 && (
              <div className="mt-2 text-xs text-slate-500">
                Sources: {section.sources.map((s, i) => (
                  <span key={i} className="mr-2">
                    {s.type === 'pdf' && s.chunks ? `Chunks: ${s.chunks.join(', ')}` : s.type}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-slate-900">AI Doubt Solver</h2>
            {topicName && (
              <p className="text-sm text-slate-500 mt-0.5">
                Topic: {topicName}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <select
              value={sourceMode}
              onChange={(e) => setSourceMode(e.target.value as 'pdf+ai' | 'pdf_only' | 'general_ai')}
              className="text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="pdf+ai">PDF + AI</option>
              <option value="pdf_only">PDF Only</option>
              <option value="general_ai">General AI</option>
            </select>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors"
              title="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Chat Messages */}
        <div className="flex-1 p-6 space-y-5 overflow-y-auto">
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
                      {msg.confidence === 'high' ? '✓ High Confidence' : '⚠️ Low Confidence'}
                    </span>
                    {msg.sourceType && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-300">
                        {renderSourceLabel(msg.sourceType)}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400 font-medium">Scope: {msg.subjectContext}</span>
                  </div>
                )}

                {/* Body Text */}
                <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>

                {/* Source Sections */}
                {renderSections(msg.sections)}

                {/* Sources Footer (legacy) */}
                {msg.sourceChunks && msg.sourceChunks.length > 0 && !msg.sections && (
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
                {sourceMode === 'general_ai' ? 'Querying AI knowledge base...' : 'Searching ChromaDB vector store and reasoning answer...'}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-100 bg-white rounded-b-2xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAskDoubt(question);
            }}
            className="flex items-center gap-3"
          >
            <input
              type="text"
              placeholder="Ask a question about this topic..."
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

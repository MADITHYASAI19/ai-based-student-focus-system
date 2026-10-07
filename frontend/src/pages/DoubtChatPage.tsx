import React, { useState, useRef } from 'react';
import { askDoubt, uploadDoubtDocument } from '../api/client';
import type { DoubtAnswer, AnswerSection } from '../api/types';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  subjectName: string;
  confidence?: 'high' | 'low';
  sourceChunks?: string[];
  sections?: AnswerSection[];
  sourceType?: 'pdf' | 'ai' | 'mixed' | 'none';
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
      text: "Hello! I'm your AI Study Companion tutor. Ask me any question, and I'll provide answers grounded in your PDF notes when available, supplementing with general AI knowledge when needed.",
      subjectName: 'All Subjects',
      confidence: 'high',
      timestamp: new Date(),
    },
  ]);
  const [question, setQuestion] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<number | undefined>(undefined);
  const [sourceMode, setSourceMode] = useState<'pdf+ai' | 'pdf_only' | 'general_ai'>('pdf+ai');
  const [uploadedDocument, setUploadedDocument] = useState<{filename: string, documentId: number} | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.pdf') && !file.name.toLowerCase().endsWith('.txt')) {
      setError('Please upload a PDF or text file.');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File is too large. Please upload a file smaller than 10 MB.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const document = await uploadDoubtDocument(file);
      setUploadedDocument({
        filename: document.filename,
        documentId: document.id
      });
      setSelectedTopicId(document.topic_id);
      // Auto-switch to subject containing this document
      const topicSubject = AVAILABLE_SUBJECTS.find(s => s.id === 1); // Default to Mathematics if unsure
      if (topicSubject) {
        setSelectedSubjectId(topicSubject.id);
      }
    } catch (err: any) {
      console.error('Failed to upload document:', err);
      if (err.code === 'ERR_NETWORK' || !err.response) {
        setError('Unable to upload the document. Please check your connection and try again.');
      } else if (err.response?.status >= 500) {
        setError('The PDF was uploaded, but we couldn\'t process it. Please try again.');
      } else {
        const errorMessage = err.response?.data?.detail || 'Failed to upload document. Please try again.';
        setError(errorMessage);
      }
    } finally {
      setUploading(false);
    }
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAskDoubt = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;

    // If no subject selected, use general AI mode
    const effectiveSubjectId = selectedSubjectId ?? AVAILABLE_SUBJECTS[0].id;
    const effectiveSourceMode = (!selectedSubjectId && !uploadedDocument) ? 'general_ai' : sourceMode;
    
    const currentSubject = AVAILABLE_SUBJECTS.find((s) => s.id === effectiveSubjectId);
    const subjectName = currentSubject ? currentSubject.name : `Subject #${effectiveSubjectId}`;

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
      // Build conversation history (last 5 messages, excluding welcome)
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
        topic_id: uploadedDocument ? selectedTopicId : undefined,
        source_mode: effectiveSourceMode,
        conversation_history: history,
      });

      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: response.answer_text,
        subjectName,
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

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-extrabold text-[#16253b] tracking-tight">
          AI doubt tutor
        </h1>
        <p className="text-sm text-[#566478] mt-1">
          Ask anything. Upload notes to get answers grounded in your material.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* PDF Upload Section */}
      <div className="bg-white rounded-2xl border border-[#e6eaf0] p-5 shadow-sm">
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-1.5 border-dashed border-[#e6eaf0] rounded-xl p-7 text-center cursor-pointer hover:border-[#24425f] transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
            className="hidden"
          />
          <p className="text-sm font-bold text-[#16253b]">
            {uploading ? 'Uploading and processing document...' : 'Drop a PDF here or click to upload'}
          </p>
          <p className="text-xs text-[#566478] mt-1">
            PDF or text files up to 10 MB. Optional.
          </p>
        </div>
        {uploadedDocument && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-emerald-600 font-bold">✓</span>
                <span className="text-sm font-semibold text-emerald-800">{uploadedDocument.filename}</span>
              </div>
              <button
                onClick={() => {
                  setUploadedDocument(null);
                  setSelectedTopicId(undefined);
                }}
                className="text-xs text-red-600 font-semibold hover:text-red-700"
              >
                Remove
              </button>
            </div>
            <p className="text-xs text-emerald-700 mt-1">Document processed and ready for RAG queries.</p>
          </div>
        )}
        <div className="mt-4">
          <span className="text-xs text-[#8b96a8]">Try asking:</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  if (!item.isOffTopic) {
                    setSelectedSubjectId(item.subjectId);
                  }
                  handleAskDoubt(item.text);
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-white border border-[#e6eaf0] hover:border-[#24425f] text-[#566478] hover:text-[#16253b] transition-colors cursor-pointer"
              >
                {item.text}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chat Messages Stream */}
      <div className="bg-white rounded-2xl border border-[#e6eaf0] shadow-sm flex flex-col min-h-[480px]">
        {/* Subject Header */}
        <div className="px-6 py-3.5 border-b border-[#e6eaf0] flex items-center justify-between bg-[#f8fafc] rounded-t-2xl">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#138a5e]"></span>
            <span className="text-xs font-semibold text-[#566478]">
              General AI active
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedSubjectId ?? ''}
              onChange={(e) => setSelectedSubjectId(e.target.value ? Number(e.target.value) : null)}
              className="text-xs font-semibold bg-white border border-[#e6eaf0] rounded-lg px-2.5 py-1 text-[#16253b] focus:outline-none focus:ring-2 focus:ring-[#24425f]"
            >
              <option value="">General AI (no subject)</option>
              {AVAILABLE_SUBJECTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {selectedSubjectId && (
              <>
                <label className="text-xs font-semibold text-[#566478]">Topic:</label>
                <select
                  value={selectedTopicId ?? ''}
                  onChange={(e) => setSelectedTopicId(e.target.value ? Number(e.target.value) : undefined)}
                  className="text-xs font-semibold bg-white border border-[#e6eaf0] rounded-lg px-2.5 py-1 text-[#16253b] focus:outline-none focus:ring-2 focus:ring-[#24425f]"
                >
                  <option value="">All subject notes</option>
                  {AVAILABLE_TOPICS.filter((topic) => topic.subjectId === selectedSubjectId).map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <label className="text-xs font-semibold text-[#566478]">Source Mode:</label>
            <select
              value={sourceMode}
              onChange={(e) => setSourceMode(e.target.value as 'pdf+ai' | 'pdf_only' | 'general_ai')}
              className="text-xs font-semibold bg-white border border-[#e6eaf0] rounded-lg px-2.5 py-1 text-[#16253b] focus:outline-none focus:ring-2 focus:ring-[#24425f]"
            >
              <option value="pdf+ai">PDF + AI</option>
              <option value="pdf_only">PDF Only</option>
              <option value="general_ai">General AI</option>
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
                <div className="w-8 h-8 rounded-full bg-[#24425f] text-white flex items-center justify-center font-bold text-xs flex-shrink-0 mt-1">
                  AI
                </div>
              )}

              <div
                className={`max-w-2xl rounded-2xl p-4 sm:p-5 text-sm ${
                  msg.sender === 'user'
                    ? 'bg-[#24425f] text-white shadow-md shadow-[#24425f]/15'
                    : 'bg-[#f4f6f8] border border-[#e6eaf0] text-[#16253b]'
                }`}
              >
                {/* AI Metadata Tags */}
                {msg.sender === 'ai' && msg.id !== 'welcome' && (
                  <div className="flex flex-wrap items-center gap-2 mb-2 pb-2 border-b border-[#e6eaf0]">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                        msg.confidence === 'high'
                          ? 'bg-[#e5f8ed] text-[#138a5e] border border-[#c3ebd3]'
                          : 'bg-[#fff1e4] text-[#e0641c] border border-[#f5d6b8]'
                      }`}
                    >
                      {msg.confidence === 'high' ? '✓ High Confidence' : '⚠️ Low Confidence'}
                    </span>
                    {msg.sourceType && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase bg-[#eef2f6] text-[#566478] border border-[#e6eaf0]">
                        {renderSourceLabel(msg.sourceType)}
                      </span>
                    )}
                    <span className="text-[11px] text-[#8b96a8] font-medium">Scope: {msg.subjectName}</span>
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
                <div className="w-8 h-8 rounded-full bg-[#16253b] text-white flex items-center justify-center font-bold text-xs flex-shrink-0 mt-1">
                  U
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-[#24425f] text-white flex items-center justify-center font-bold text-xs flex-shrink-0 animate-pulse">
                AI
              </div>
              <div className="bg-[#f4f6f8] border border-[#e6eaf0] rounded-2xl p-4 text-xs text-[#566478] flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#24425f] animate-ping"></div>
                {sourceMode === 'general_ai' ? 'Querying AI knowledge base...' : 'Searching ChromaDB vector store and reasoning answer...'}
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-[#e6eaf0] bg-white rounded-b-2xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAskDoubt(question);
            }}
            className="flex items-center gap-3"
          >
            <input
              type="text"
              placeholder="Ask a question..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={loading}
              className="flex-1 px-4 py-3 bg-white border border-[#e6eaf0] rounded-xl text-[#16253b] placeholder-[#8b96a8] text-sm focus:outline-none focus:ring-2 focus:ring-[#24425f]"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-[#1d3a5a] to-[#2e4a67] hover:from-[#16253b] hover:to-[#24425f] text-white font-semibold text-sm shadow-lg shadow-[#1d3a5a]/25 disabled:opacity-50 transition-all cursor-pointer"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAvailableTopics,
  generateQuiz,
  submitQuiz,
  getQuizHistory,
  getTopicQuizStats,
  recordFaceTrackingEvent,
  uploadTopicDocument,
} from '../api/client';
import { useFaceDetection } from '../hooks/useFaceDetection';
import { usePhoneDetection } from '../hooks/usePhoneDetection';
import { useProctoring } from '../hooks/useProctoring';
import { DoubtSolverModal } from '../components/DoubtSolverModal';
import type {
  QuizOut,
  QuizAttemptOut,
  AvailableTopic,
  TopicQuizStats,
  QuizConfig,
  QuizSubmission,
  DifficultyLevel,
  QuestionType,
  StudyDocument,
} from '../api/types';

export const QuizPage: React.FC = () => {
  const navigate = useNavigate();
  
  // Quiz configuration state
  const [availableTopics, setAvailableTopics] = useState<AvailableTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<AvailableTopic | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>(['mcq']);
  const [questionCount, setQuestionCount] = useState(5);
  const [timeLimit, setTimeLimit] = useState<number | null>(null);
  const [fullscreenRequired, setFullscreenRequired] = useState(false);
  const [pdfSourceMode, setPdfSourceMode] = useState<'topic_knowledge' | 'pdf_only' | 'topic_pdf'>('topic_knowledge');
  const [faceTrackingEnabled, setFaceTrackingEnabled] = useState(true);
  
  // PDF upload state
  const [uploadedPdf, setUploadedPdf] = useState<File | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadedDocument, setUploadedDocument] = useState<StudyDocument | null>(null);
  
  // Quiz state
  const [quiz, setQuiz] = useState<QuizOut | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [quizResult, setQuizResult] = useState<QuizAttemptOut | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [showTestRules, setShowTestRules] = useState(false);
  const [quizStatus, setQuizStatus] = useState<'not_started' | 'in_progress' | 'paused' | 'submitted'>('not_started');
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [showProctoringHUD, setShowProctoringHUD] = useState(true);
  
  // Timer state
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [timerActive, setTimerActive] = useState(false);
  
  // Loading/error states
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // History and stats
  const [history, setHistory] = useState<QuizAttemptOut[]>([]);
  const [topicStats, setTopicStats] = useState<TopicQuizStats | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Doubt solver modal
  const [showDoubtSolver, setShowDoubtSolver] = useState(false);

  // ── Proctoring: reuse existing hooks (same as SessionPage) ─────────────────
  const faceDetection = useFaceDetection();
  const phoneDetection = usePhoneDetection(faceDetection.videoRef);

  // Buffer for face tracking events logged during quiz (posted after submit)
  const faceEventBufferRef = useRef<Array<{ eventType: string; ts: number }>>([]);

  const isQuizInProgress = quizStatus === 'in_progress' && faceTrackingEnabled;

  const proctoring = useProctoring({
    sessionId: undefined, // no session link for quiz proctoring; we buffer events ourselves
    isSessionActive: isQuizInProgress,
    cameraStatus: faceDetection.cameraStatus,
    cameraError: faceDetection.cameraError,
    faceDetected: faceDetection.faceDetected,
    faceDetections: faceDetection.detections,
    phoneDetected: phoneDetection.phoneDetected,
    phoneConfidence: phoneDetection.phoneConfidence,
    phoneBox: phoneDetection.phoneBox,
  });

  // Buffer every new violation / cleared event so we can POST them after submit
  const lastBufferedEventRef = useRef<string | null>(null);
  const bufferProctoringEvent = useCallback((eventType: string) => {
    if (eventType && eventType !== lastBufferedEventRef.current) {
      lastBufferedEventRef.current = eventType;
      faceEventBufferRef.current.push({ eventType, ts: Date.now() });
    }
  }, []);

  // Handle PDF upload
  const handlePdfUpload = async (file: File) => {
    if (!selectedTopic) {
      setError('Please select a topic first before uploading a PDF');
      return;
    }
    
    setUploadingPdf(true);
    setError(null);
    
    try {
      const document = await uploadTopicDocument(selectedTopic.id, file);
      setUploadedDocument(document);
      setUploadedPdf(file);
    } catch (err: any) {
      console.error('PDF upload failed:', err);
      setError(err.response?.data?.detail || 'Failed to upload PDF. Please try again.');
    } finally {
      setUploadingPdf(false);
    }
  };

  // Detect new proctoring events and buffer them
  useEffect(() => {
    if (!isQuizInProgress) return;
    const latest = proctoring.lastLoggedEvent;
    if (latest) bufferProctoringEvent(latest);
  }, [proctoring.lastLoggedEvent, isQuizInProgress, bufferProctoringEvent]);
  
  // Load available topics on mount
  useEffect(() => {
    loadAvailableTopics();
    loadQuizHistory();
  }, []);
  
  // Load topic stats when topic is selected
  useEffect(() => {
    if (selectedTopic) {
      loadTopicStats(selectedTopic.id);
    }
  }, [selectedTopic]);
  
  const loadAvailableTopics = async () => {
    setLoadingTopics(true);
    try {
      const topics = await getAvailableTopics();
      setAvailableTopics(topics);
      if (topics.length > 0 && !selectedTopic) {
        setSelectedTopic(topics[0]);
      }
    } catch (err: any) {
      console.error('Failed to load topics:', err);
      setError('Failed to load available topics. Please try again.');
    } finally {
      setLoadingTopics(false);
    }
  };
  
  const loadTopicStats = async (topicId: number) => {
    try {
      const stats = await getTopicQuizStats(topicId);
      setTopicStats(stats);
    } catch (err: any) {
      console.error('Failed to load topic stats:', err);
    }
  };
  
  const loadQuizHistory = async () => {
    try {
      const history = await getQuizHistory(10);
      setHistory(history);
    } catch (err: any) {
      console.error('Failed to load quiz history:', err);
    }
  };
  
  const handleGenerateQuiz = async () => {
    if (!selectedTopic) return;

    setGeneratingQuiz(true);
    setError(null);
    setQuiz(null);
    setAnswers({});
    setCurrentQuestionIndex(0);
    setShowResults(false);
    faceEventBufferRef.current = [];
    lastBufferedEventRef.current = null;
    setShowTestRules(true); // Show test rules before starting quiz

    const config: QuizConfig = {
      topic_id: selectedTopic.id,
      difficulty,
      question_types: questionTypes,
      n_questions: questionCount,
      time_limit_minutes: timeLimit,
      fullscreen_required: fullscreenRequired,
      pdf_source_mode: pdfSourceMode,
    };

    try {
      const generatedQuiz = await generateQuiz(config);
      setQuiz(generatedQuiz);
      setGeneratingQuiz(false);
    } catch (err: any) {
      console.error('Failed to generate quiz:', err);
      setError(err.response?.data?.detail || 'Failed to generate quiz. Please try again.');
      setGeneratingQuiz(false);
      setShowTestRules(false);
    }
  };

  const handleStartQuiz = async () => {
    if (!quiz) return;

    setShowTestRules(false);
    setQuizStatus('in_progress');
    setShowProctoringHUD(true);

    // Start face tracking camera if enabled
    if (faceTrackingEnabled) {
      try {
        await faceDetection.startTracking();
        await phoneDetection.startPhoneDetection();
      } catch (err) {
        console.warn('[Quiz] Face tracking failed to start:', err);
        // Non-blocking — quiz continues even if camera fails
      }
    }

    // Enter fullscreen if required
    if (quiz.fullscreen_required) {
      try {
        await document.documentElement.requestFullscreen();
        setFullscreenActive(true);
      } catch (err) {
        console.error('Fullscreen request failed:', err);
        setError('Fullscreen is required for this quiz but could not be enabled.');
        setQuizStatus('not_started');
        // Stop camera if we're aborting
        faceDetection.stopTracking();
        phoneDetection.stopPhoneDetection();
        return;
      }
    }

    // Start timer if configured
    if (quiz.time_limit_minutes) {
      setTimeRemaining(quiz.time_limit_minutes * 60);
      setTimerActive(true);
    }
  };

  const handleExitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setFullscreenActive(false);
    }
  };

  // Fullscreen change detection
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = !!document.fullscreenElement;
      setFullscreenActive(isFullscreen);

      // If quiz is in progress and fullscreen was exited, pause the quiz
      if (quizStatus === 'in_progress' && !isFullscreen && quiz?.fullscreen_required) {
        setQuizStatus('paused');
        setTimerActive(false);
        setError('Fullscreen mode was exited. The quiz has been paused. Click "Resume" to continue in fullscreen mode.');
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [quizStatus, quiz?.fullscreen_required]);

  // Tab visibility change detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && quizStatus === 'in_progress') {
        // Could record tab switch event here
        console.log('Tab hidden during quiz');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [quizStatus]);

  // Cleanup face tracking on unmount or quiz end
  useEffect(() => {
    return () => {
      faceDetection.stopTracking();
      phoneDetection.stopPhoneDetection();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const handleSelectAnswer = (questionId: string, answer: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: answer,
    }));
  };
  
  const handleNextQuestion = () => {
    if (quiz && currentQuestionIndex < quiz.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };
  
  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };
  
  const handleJumpToQuestion = (index: number) => {
    if (quiz && index >= 0 && index < quiz.questions.length) {
      setCurrentQuestionIndex(index);
    }
  };
  
  const handleSubmitQuiz = async () => {
    if (!quiz || submitting) return;
    
    setSubmitting(true);
    setError(null);

    // Stop proctoring camera before submitting
    faceDetection.stopTracking();
    phoneDetection.stopPhoneDetection();
    setQuizStatus('submitted');
    
    const submission: QuizSubmission = {
      quiz_cache_key: quiz.quiz_cache_key,
      topic_id: quiz.topic_id,
      difficulty: quiz.difficulty,
      question_types: quiz.question_types,
      n_questions: quiz.questions.length,
      time_limit_minutes: quiz.time_limit_minutes,
      start_time: quiz.time_limit_minutes && timeLimit ? new Date(Date.now() - (timeLimit * 60 - timeRemaining) * 1000).toISOString() : new Date().toISOString(),
      answers: Object.entries(answers).map(([question_id, answer]) => ({ question_id, answer })),
    };
    
    try {
      const result = await submitQuiz(submission);
      setQuizResult(result);
      setShowResults(true);
      setTimerActive(false);

      // Batch-post all buffered face tracking events to the attempt record
      if (faceTrackingEnabled && faceEventBufferRef.current.length > 0 && result.id) {
        const buffer = [...faceEventBufferRef.current];
        faceEventBufferRef.current = [];
        // Fire-and-forget; non-blocking
        Promise.all(
          buffer.map((ev) =>
            recordFaceTrackingEvent(result.id, ev.eventType).catch(() => {})
          )
        ).catch(() => {});
      }
      
      // Refresh history and stats
      await loadQuizHistory();
      if (selectedTopic) {
        await loadTopicStats(selectedTopic.id);
      }
    } catch (err: any) {
      console.error('Failed to submit quiz:', err);
      setError(err.response?.data?.detail || 'Failed to submit quiz. Please try again.');
      // Restore in_progress state if submission failed
      setQuizStatus('in_progress');
    } finally {
      setSubmitting(false);
    }
  };
  
  const handleRetakeQuiz = () => {
    // Stop any active camera
    faceDetection.stopTracking();
    phoneDetection.stopPhoneDetection();
    faceEventBufferRef.current = [];
    lastBufferedEventRef.current = null;

    setQuiz(null);
    setAnswers({});
    setCurrentQuestionIndex(0);
    setShowResults(false);
    setQuizResult(null);
    setTimeRemaining(0);
    setTimerActive(false);
    setQuizStatus('not_started');
    setFullscreenActive(false);
    handleExitFullscreen();
  };

  const handleResumeQuiz = async () => {
    if (!quiz) return;

    try {
      await document.documentElement.requestFullscreen();
      setFullscreenActive(true);
      setQuizStatus('in_progress');
      setError(null);

      // Resume timer if time remaining
      if (timeRemaining > 0) {
        setTimerActive(true);
      }
    } catch (err) {
      console.error('Fullscreen request failed:', err);
      setError('Could not re-enter fullscreen mode.');
    }
  };
  
  // Timer effect
  useEffect(() => {
    let interval: number | null = null;
    if (timerActive && timeRemaining > 0) {
      interval = window.setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            setTimerActive(false);
            handleSubmitQuiz(); // Auto-submit when time expires
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, [timerActive, timeRemaining]);
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const currentQuestion = quiz?.questions[currentQuestionIndex];
  const answeredCount = Object.keys(answers).length;
  const totalQuestions = quiz?.questions.length || 0;
  
  // Calculate question type distribution for mixed mode
  const getQuestionDistribution = () => {
    if (!questionTypes.includes('mixed' as QuestionType)) return null;
    const types: QuestionType[] = ['mcq', 'true_false', 'fill_blank', 'coding'];
    const baseCount = Math.floor(questionCount / types.length);
    const distribution: Record<string, number> = {};
    types.forEach((type, i) => {
      distribution[type] = baseCount + (i < (questionCount % types.length) ? 1 : 0);
    });
    return distribution;
  };
  
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            AI Adaptive Quizzes
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Generate topic-based quizzes with multiple question types, adaptive difficulty, and detailed performance analytics.
          </p>
        </div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition-all"
        >
          {showHistory ? 'Hide History' : 'View History'}
        </button>
      </div>
      
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}
      
      {/* Quiz History */}
      {showHistory && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <h2 className="font-bold text-slate-900">Quiz History</h2>
          </div>
          {history.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No quiz attempts yet. Take your first quiz to see your history here.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {history.map((attempt) => (
                <div key={attempt.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50">
                  <div>
                    <p className="font-semibold text-slate-900">Attempt #{attempt.id}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(attempt.completed_at || '').toLocaleString()} • {attempt.difficulty} • {attempt.correct_count || 0} correct
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`font-bold ${attempt.score >= 70 ? 'text-emerald-600' : attempt.score >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                      {attempt.score.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Test Rules Screen */}
      {showTestRules && quiz && !showResults && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            TEST RULES
          </h2>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500">Topic</p>
                <p className="font-bold text-slate-900">{quiz.topic_name}</p>
              </div>
              <div>
                <p className="text-slate-500">Difficulty</p>
                <p className="font-bold text-slate-900 capitalize">{quiz.difficulty}</p>
              </div>
              <div>
                <p className="text-slate-500">Questions</p>
                <p className="font-bold text-slate-900">{quiz.questions.length}</p>
              </div>
              <div>
                <p className="text-slate-500">Question Types</p>
                <p className="font-bold text-slate-900 capitalize">{quiz.question_types.join(', ')}</p>
              </div>
              <div>
                <p className="text-slate-500">Time Limit</p>
                <p className="font-bold text-slate-900">{quiz.time_limit_minutes ? `${quiz.time_limit_minutes} minutes` : 'No limit'}</p>
              </div>
              <div>
                <p className="text-slate-500">Total Points</p>
                <p className="font-bold text-slate-900">{quiz.total_points}</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Proctoring Settings
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className={faceTrackingEnabled ? 'text-indigo-600' : 'text-slate-400'}>
                    {faceTrackingEnabled ? '🎥' : '○'}
                  </span>
                  <span className="text-slate-700">Face Tracking: {faceTrackingEnabled ? 'Active (webcam monitoring)' : 'Disabled'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={quiz.fullscreen_required ? 'text-emerald-600' : 'text-slate-500'}>
                    {quiz.fullscreen_required ? '✓' : '○'}
                  </span>
                  <span className="text-slate-700">Full-Screen Mode: {quiz.fullscreen_required ? 'Required' : 'Normal'}</span>
                </div>
                {quiz.pdf_source_mode && (
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-600">📄</span>
                    <span className="text-slate-700">Content Source: {quiz.pdf_source_mode === 'topic_knowledge' ? 'Topic Knowledge' : quiz.pdf_source_mode === 'pdf_only' ? 'PDF Only' : 'Topic + PDF'}</span>
                  </div>
                )}
              </div>
            </div>

            {quiz.fullscreen_required && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm text-amber-800 font-semibold">
                  ⚠️ Important
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  Leaving the full-screen test environment will pause/stop this test according to the test policy.
                </p>
              </div>
            )}          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <button
              onClick={() => {
                setShowTestRules(false);
                setQuiz(null);
              }}
              className="flex-1 px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleStartQuiz}
              className="flex-1 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              Start Test
            </button>
          </div>
        </div>
      )}

      {/* Quiz Configuration Screen */}
      {!quiz && !showResults && !showTestRules && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Configure Your Quiz
          </h2>
          
          {/* Topic Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              1. Select Topic
            </label>
            {loadingTopics ? (
              <div className="flex items-center gap-3 text-sm text-indigo-600">
                <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                Loading available topics...
              </div>
            ) : availableTopics.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-sm text-center">
                No topics available. Add topics to your study plan first.
              </div>
            ) : (
              <div className="space-y-4">
                {(() => {
                  // Group topics by subject
                  const topicsBySubject = availableTopics.reduce((acc, topic) => {
                    const subject = topic.subject_name || 'Uncategorized';
                    if (!acc[subject]) {
                      acc[subject] = [];
                    }
                    acc[subject].push(topic);
                    return acc;
                  }, {} as Record<string, AvailableTopic[]>);

                  return Object.entries(topicsBySubject).map(([subjectName, topics]) => (
                    <div key={subjectName} className="space-y-2">
                      {/* Subject Header */}
                      <div className="flex items-center gap-2 pb-1 border-b border-slate-200">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{subjectName}</span>
                        <span className="text-[10px] text-slate-400">({topics.length})</span>
                      </div>
                      {/* Subject Topics */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {topics.map((topic) => {
                          const isSelected = selectedTopic?.id === topic.id;
                          return (
                            <button
                              key={topic.id}
                              type="button"
                              onClick={() => setSelectedTopic(topic)}
                              className={`p-4 rounded-xl text-left border transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs'
                                  : 'bg-white border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <p className="text-sm font-bold text-slate-900">{topic.name}</p>
                              <p className="text-xs text-slate-500 mt-1 capitalize">{topic.difficulty}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
          
          {/* Topic Stats */}
          {selectedTopic && topicStats && topicStats.attempt_count > 0 && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                {selectedTopic.name} Performance
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-slate-500">Attempts</p>
                  <p className="font-bold text-slate-900">{topicStats.attempt_count}</p>
                </div>
                <div>
                  <p className="text-slate-500">Average</p>
                  <p className="font-bold text-slate-900">{topicStats.average_score.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-slate-500">Best</p>
                  <p className="font-bold text-emerald-600">{topicStats.best_score.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-slate-500">Questions</p>
                  <p className="font-bold text-slate-900">{topicStats.total_questions_attempted}</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Difficulty Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              2. Difficulty Level
            </label>
            <div className="flex items-center gap-3">
              {(['easy', 'medium', 'hard', 'mixed'] as DifficultyLevel[]).map((diff) => {
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
                          : diff === 'hard'
                          ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                          : 'bg-slate-700 text-white shadow-md'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {diff}
                  </button>
                );
              })}
            </div>
          </div>
          
          {/* Question Type Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              3. Question Types
            </label>
            <div className="flex flex-wrap gap-2">
              {([
                { type: 'mcq' as QuestionType, label: 'MCQ' },
                { type: 'true_false' as QuestionType, label: 'True/False' },
                { type: 'fill_blank' as QuestionType, label: 'Fill Blank' },
                { type: 'short_answer' as QuestionType, label: 'Short Answer' },
                { type: 'coding' as QuestionType, label: 'Coding' },
                { type: 'mixed' as QuestionType, label: 'Mixed' },
              ]).map(({ type, label }) => {
                const isSelected = questionTypes.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      if (type === 'mixed') {
                        setQuestionTypes(['mixed' as QuestionType]);
                      } else if (isSelected) {
                        setQuestionTypes(questionTypes.filter((t) => t !== type));
                      } else {
                        setQuestionTypes([...questionTypes, type]);
                      }
                    }}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {isSelected ? '✓ ' : ''}{label}
                  </button>
                );
              })}
            </div>
            
            {/* Show distribution for mixed mode */}
            {questionTypes.includes('mixed') && (
              <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs font-semibold text-slate-700 mb-2">Question Distribution:</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {Object.entries(getQuestionDistribution() || {}).map(([type, count]) => (
                    <span key={type} className="px-2 py-1 bg-white rounded border border-slate-300">
                      {type}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Question Count */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              4. Number of Questions
            </label>
            <div className="flex items-center gap-3">
              {[5, 10, 15, 20].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setQuestionCount(count)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    questionCount === count
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {count}
                </button>
              ))}
              <input
                type="number"
                min="1"
                max="30"
                value={questionCount}
                onChange={(e) => setQuestionCount(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
                className="w-20 px-3 py-2 rounded-xl text-xs bg-slate-50 border border-slate-300"
              />
            </div>
          </div>
          
          {/* Timer Configuration */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              5. Time Limit (Optional)
            </label>
            <div className="flex items-center gap-3">
              {[
                { value: null, label: 'No Limit' },
                { value: 10, label: '10 min' },
                { value: 20, label: '20 min' },
                { value: 30, label: '30 min' },
              ].map(({ value, label }) => (
                <button
                  key={value || 'none'}
                  type="button"
                  onClick={() => setTimeLimit(value)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    timeLimit === value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
              <input
                type="number"
                min="1"
                max="120"
                placeholder="Custom"
                value={timeLimit || ''}
                onChange={(e) => setTimeLimit(e.target.value ? Math.min(120, Math.max(1, Number(e.target.value))) : null)}
                className="w-24 px-3 py-2 rounded-lg text-xs bg-slate-50 border border-slate-300"
              />
            </div>
          </div>



          {/* Face Tracking Configuration */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              6. Face Tracking (Proctoring)
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFaceTrackingEnabled(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  !faceTrackingEnabled
                    ? 'bg-slate-700 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Disabled
              </button>
              <button
                type="button"
                onClick={() => setFaceTrackingEnabled(true)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  faceTrackingEnabled
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                🎥 Enabled
              </button>
            </div>
            {faceTrackingEnabled && (
              <p className="text-xs text-slate-500 mt-2">
                Webcam will monitor for distraction events: no face, multiple faces, phone detected, looking away.
              </p>
            )}
          </div>

          {/* Fullscreen Configuration */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              7. Full-Screen Mode
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFullscreenRequired(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  !fullscreenRequired
                    ? 'bg-slate-700 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Normal Mode
              </button>
              <button
                type="button"
                onClick={() => setFullscreenRequired(true)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  fullscreenRequired
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Full-Screen Required
              </button>
            </div>
            {fullscreenRequired && (
              <p className="text-xs text-slate-500 mt-2">
                The quiz will pause if you exit full-screen mode.
              </p>
            )}
          </div>

          {/* PDF Source Mode Configuration */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              8. Quiz Content Source
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'topic_knowledge' as const, label: 'Topic Knowledge' },
                { value: 'pdf_only' as const, label: 'My PDF Only' },
                { value: 'topic_pdf' as const, label: 'Topic + My PDF' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPdfSourceMode(value)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    pdfSourceMode === value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {pdfSourceMode === 'pdf_only' && (
              <p className="text-xs text-slate-500 mt-2">
                Questions will be generated only from your uploaded PDF. If no PDF is available, topic knowledge will be used.
              </p>
            )}
            {pdfSourceMode === 'topic_pdf' && (
              <p className="text-xs text-slate-500 mt-2">
                Questions will use both your PDF content and general topic knowledge.
              </p>
            )}
          </div>

          {/* PDF Upload Section */}
          {(pdfSourceMode === 'pdf_only' || pdfSourceMode === 'topic_pdf') && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Upload Study PDF
              </label>
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-indigo-400 transition-all">
                {uploadedDocument ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2 text-emerald-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-semibold">PDF Uploaded Successfully</span>
                    </div>
                    <p className="text-xs text-slate-600">{uploadedDocument.filename}</p>
                    <p className="text-xs text-slate-500">
                      Status: {uploadedDocument.status === 'completed' ? 'Processed' : uploadedDocument.status}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedPdf(null);
                        setUploadedDocument(null);
                      }}
                      className="text-xs text-red-600 font-semibold hover:text-red-700 underline"
                    >
                      Remove PDF
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <svg className="w-12 h-12 mx-auto text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-slate-600">
                      Upload a PDF to use as the source for quiz questions
                    </p>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handlePdfUpload(file);
                        }
                      }}
                      disabled={uploadingPdf || !selectedTopic}
                      className="hidden"
                      id="pdf-upload"
                    />
                    <label
                      htmlFor="pdf-upload"
                      className={`inline-block px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-all ${
                        uploadingPdf || !selectedTopic
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                    >
                      {uploadingPdf ? 'Uploading...' : 'Select PDF File'}
                    </label>
                    {!selectedTopic && (
                      <p className="text-xs text-slate-400">Select a topic first to upload PDF</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Generate Button */}
          <div className="pt-4 border-t border-slate-100">
            <button
              onClick={handleGenerateQuiz}
              disabled={!selectedTopic || generatingQuiz}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {generatingQuiz ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating Quiz...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate Quiz
                </>
              )}
            </button>
          </div>
        </div>
      )}
      
      {/* Quiz Paused Screen */}
      {quiz && quizStatus === 'paused' && !showResults && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-6">
          <div className="w-16 h-16 mx-auto bg-amber-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Quiz Paused</h2>
            <p className="text-slate-500 mt-2">
              {quiz.fullscreen_required
                ? 'You exited full-screen mode. The quiz has been paused.'
                : 'The quiz has been paused.'}
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleResumeQuiz}
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              Resume Quiz
            </button>
            <button
              onClick={handleRetakeQuiz}
              className="px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition-all cursor-pointer"
            >
              Cancel Quiz
            </button>
          </div>
        </div>
      )}

      {/* Quiz Taking Interface */}
      {quiz && quizStatus === 'in_progress' && !showResults && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Quiz Header */}
          <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-slate-50 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                {quiz.topic_name} • {quiz.difficulty}
              </p>
              <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">
                Question {currentQuestionIndex + 1} of {totalQuestions}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              {/* Ask AI Button */}
              <button
                onClick={() => setShowDoubtSolver(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-violet-100 text-violet-700 hover:bg-violet-200 transition-all"
                title="Ask AI for help"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Ask AI
              </button>

              {/* Face Tracking HUD badge */}
              {faceTrackingEnabled && (
                <button
                  onClick={() => setShowProctoringHUD((v) => !v)}
                  title="Toggle proctoring panel"
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                    proctoring.activeWarning
                      ? 'bg-rose-100 text-rose-700 animate-pulse'
                      : proctoring.proctoringActive
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${
                    proctoring.activeWarning ? 'bg-rose-500' : proctoring.proctoringActive ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'
                  }`} />
                  {proctoring.activeWarning ? '⚠ Violation' : '🎥 Proctored'}
                  {proctoring.totalWarnings > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-amber-500 text-white rounded-full text-[9px] font-black">
                      {proctoring.totalWarnings}
                    </span>
                  )}
                </button>
              )}
              {/* Fullscreen Status */}
              {quiz.fullscreen_required && (
                <div className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 ${
                  fullscreenActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    fullscreenActive ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}></span>
                  {fullscreenActive ? 'Full-Screen' : 'Full-Screen Exited'}
                </div>
              )}
              {quiz.time_limit_minutes && (
                <div className={`px-3 py-1.5 rounded-lg font-mono text-sm font-bold ${
                  timeRemaining < 60 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'
                }`}>
                  {formatTime(timeRemaining)}
                </div>
              )}
              <div className="px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-700 text-sm font-bold">
                {answeredCount}/{totalQuestions} Answered
              </div>
            </div>
          </div>

          {/* Compact Proctoring HUD (collapsible, shown below header) */}
          {faceTrackingEnabled && showProctoringHUD && (
            <div className="border-b border-slate-100 bg-slate-950/95 px-4 py-3">
              {/* Hidden video element for camera feed */}
              <video
                ref={faceDetection.videoRef}
                autoPlay
                playsInline
                muted
                className="hidden"
              />
              <canvas ref={faceDetection.canvasRef} className="hidden" />

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">🔴 Proctoring Live</span>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Face */}
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold ${
                    proctoring.faceStatus === 'detected' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      proctoring.faceStatus === 'detected' ? 'bg-emerald-400' : 'bg-rose-400'
                    }`} />
                    {proctoring.faceStatus === 'detected' ? 'Face ✓' : 'No Face'}
                  </span>
                  {/* People */}
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold ${
                    proctoring.peopleCount === 1 ? 'bg-slate-700 text-slate-300' : proctoring.peopleCount > 1 ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700 text-slate-500'
                  }`}>
                    👥 {proctoring.peopleCount}
                  </span>
                  {/* Phone */}
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold ${
                    proctoring.phoneStatus === 'detected' ? 'bg-amber-500/20 text-amber-400 animate-pulse' : 'bg-slate-700 text-slate-300'
                  }`}>
                    📱 {proctoring.phoneStatus === 'detected' ? 'Phone!' : 'Clear'}
                  </span>
                  {/* Gaze */}
                  {proctoring.faceStatus === 'detected' && (
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold ${
                      proctoring.isLookingAway ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-300'
                    }`}>
                      👀 {proctoring.isLookingAway ? 'Away' : 'Focused'}
                    </span>
                  )}
                  {/* Warnings */}
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold ${
                    proctoring.totalWarnings > 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700 text-slate-400'
                  }`}>
                    ⚠ {proctoring.totalWarnings} violations
                  </span>
                </div>
                <button
                  onClick={() => setShowProctoringHUD(false)}
                  className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
                  title="Minimize proctoring panel"
                >
                  ✕
                </button>
              </div>

              {/* Active violation banner */}
              {proctoring.activeWarning && (
                <div className="mt-2 px-3 py-2 rounded-lg bg-rose-600/30 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-2">
                  <span className="animate-pulse">⚠</span>
                  {proctoring.activeWarning}
                </div>
              )}
            </div>
          )}
          
          {/* Question Navigation */}
          <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePreviousQuestion}
                disabled={currentQuestionIndex === 0}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-50 text-xs font-semibold transition-all"
              >
                Previous
              </button>
              <button
                onClick={handleNextQuestion}
                disabled={currentQuestionIndex === totalQuestions - 1}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-50 text-xs font-semibold transition-all"
              >
                Next
              </button>
            </div>
            <div className="flex items-center gap-1">
              {quiz?.questions.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => handleJumpToQuestion(idx)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    idx === currentQuestionIndex
                      ? 'bg-indigo-600 text-white'
                      : answers[quiz.questions[idx].id || '']
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>
          
          {/* Question */}
          {currentQuestion && (
            <div className="p-6">
              <div className="mb-4">
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase bg-slate-100 text-slate-600">
                  {currentQuestion.type}
                </span>
                {currentQuestion.points && (
                  <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                    {currentQuestion.points} pts
                  </span>
                )}
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                {currentQuestion.question_text}
              </h3>
              
              {/* MCQ Options */}
              {currentQuestion.type === 'mcq' && currentQuestion.options && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {currentQuestion.options.map((option, idx) => {
                    const isSelected = answers[currentQuestion.id || ''] === option;
                    const optionLetters = ['A', 'B', 'C', 'D'];
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectAnswer(currentQuestion.id || '', option)}
                        className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-600 font-semibold text-indigo-950 shadow-sm ring-2 ring-indigo-500/20'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <span className={`w-8 h-8 rounded-lg text-sm font-bold flex items-center justify-center ${
                          isSelected ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-300'
                        }`}>
                          {optionLetters[idx] || idx + 1}
                        </span>
                        <span className="flex-1">{option}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              
              {/* True/False */}
              {currentQuestion.type === 'true_false' && (
                <div className="grid grid-cols-2 gap-3">
                  {['True', 'False'].map((option) => {
                    const isSelected = answers[currentQuestion.id || ''] === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => handleSelectAnswer(currentQuestion.id || '', option)}
                        className={`p-4 rounded-xl border text-center font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-600 text-indigo-950 shadow-sm ring-2 ring-indigo-500/20'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              )}
              
              {/* Fill Blank / Short Answer / Coding */}
              {['fill_blank', 'short_answer', 'coding'].includes(currentQuestion.type) && (
                <div>
                  <textarea
                    rows={currentQuestion.type === 'coding' ? 8 : 3}
                    placeholder={
                      currentQuestion.type === 'coding'
                        ? 'Write your code solution here...'
                        : 'Type your answer...'
                    }
                    value={answers[currentQuestion.id || ''] || ''}
                    onChange={(e) => handleSelectAnswer(currentQuestion.id || '', e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              )}
            </div>
          )}
          
          {/* Submit Button */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {answeredCount === totalQuestions ? (
                <span className="text-emerald-600 font-semibold">✓ All questions answered</span>
              ) : (
                <span>{totalQuestions - answeredCount} questions remaining</span>
              )}
            </div>
            <button
              onClick={handleSubmitQuiz}
              disabled={submitting || answeredCount === 0}
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-600/25 disabled:opacity-50 transition-all cursor-pointer"
            >
              {submitting ? 'Submitting...' : 'Submit Quiz'}
            </button>
          </div>
        </div>
      )}
      
      {/* Results Screen */}
      {showResults && quizResult && (
        <div className="space-y-6">
          {/* Score Banner */}
          <div className={`p-8 rounded-2xl text-white shadow-lg ${
            quizResult.score >= 70
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600'
              : quizResult.score >= 50
              ? 'bg-gradient-to-r from-amber-500 to-orange-600'
              : 'bg-gradient-to-r from-rose-500 to-red-600'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div>
                <h2 className="text-3xl font-black tracking-tight">
                  {quizResult.score.toFixed(1)}%
                </h2>
                <p className="text-white/80 mt-1">
                  {quiz?.topic_id ? `Topic ID: ${quiz.topic_id}` : 'Quiz Completed'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 text-center">
                  <p className="text-xs text-white/70">Correct</p>
                  <p className="text-2xl font-black">{quizResult.correct_count || 0}</p>
                </div>
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 text-center">
                  <p className="text-xs text-white/70">Incorrect</p>
                  <p className="text-2xl font-black">{quizResult.incorrect_count || 0}</p>
                </div>
                <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 text-center">
                  <p className="text-xs text-white/70">Total Points</p>
                  <p className="text-2xl font-black">{quizResult.total_points?.toFixed(1) || '0'}</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Question-by-Question Results */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-900">Question-by-Question Results</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {quizResult.question_results?.map((result, idx) => (
                <div
                  key={idx}
                  className={`p-6 ${
                    result.is_correct ? 'bg-emerald-50/50' : 'bg-rose-50/50'
                  }`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white ${
                      result.is_correct ? 'bg-emerald-600' : 'bg-rose-600'
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">{result.question_text}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {result.question_type} • {result.points_awarded}/{result.points_possible} points
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 p-4 bg-white rounded-xl border border-slate-200">
                    <div>
                      <p className="text-xs text-slate-500">Your Answer:</p>
                      <p className="font-mono text-sm bg-slate-50 p-2 rounded border border-slate-200">
                        {result.student_answer || '(no answer)'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Correct Answer:</p>
                      <p className="font-mono text-sm bg-slate-50 p-2 rounded border border-slate-200">
                        {result.correct_answer}
                      </p>
                    </div>
                  </div>
                  
                  {result.explanation && (
                    <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <p className="text-xs font-semibold text-slate-700 mb-1">Explanation:</p>
                      <p className="text-sm text-slate-600">{result.explanation}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleRetakeQuiz}
              className="flex-1 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              Retake Quiz
            </button>
            <button
              onClick={() => navigate('/session')}
              className="flex-1 px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition-all cursor-pointer"
            >
              Back to Focus Session
            </button>
          </div>
        </div>
      )}

      {/* Doubt Solver Modal */}
      <DoubtSolverModal
        isOpen={showDoubtSolver}
        onClose={() => setShowDoubtSolver(false)}
        topicId={quiz?.topic_id}
        topicName={quiz?.topic_name}
        subjectId={selectedTopic?.subject_id}
        subjectName={selectedTopic?.subject_name}
      />
    </div>
  );
};

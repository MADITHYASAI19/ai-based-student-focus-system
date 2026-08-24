import React, { useState } from 'react';
import { useSession } from '../hooks/useSession';

export const SessionPage: React.FC = () => {
  const { session, loading, error, elapsedTime, formatTime, startSession, endSession } = useSession();
  const [topicId, setTopicId] = useState<number>(1); // Default topic for demo

  const handleStartSession = async () => {
    try {
      await startSession({ topic_id: topicId });
    } catch (err) {
      console.error('Failed to start session:', err);
    }
  };

  const handleEndSession = async () => {
    if (!session) return;
    try {
      await endSession(session.id);
    } catch (err) {
      console.error('Failed to end session:', err);
    }
  };

  const isSessionActive = session && !session.end_time;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Study Session</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {!session ? (
          <div className="bg-white rounded-lg shadow-md p-8">
            <div className="mb-6">
              <label htmlFor="topicId" className="block text-sm font-medium text-gray-700 mb-2">
                Topic ID
              </label>
              <input
                id="topicId"
                type="number"
                value={topicId}
                onChange={(e) => setTopicId(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                min="1"
              />
            </div>
            <button
              onClick={handleStartSession}
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Starting session...
                </>
              ) : (
                'Start Session'
              )}
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-8">
            {isSessionActive ? (
              <>
                <div className="text-center mb-8">
                  <div className="text-6xl font-bold text-gray-900 mb-2">
                    {formatTime(elapsedTime)}
                  </div>
                  <p className="text-gray-600">Session Duration</p>
                </div>

                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-6 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="animate-pulse">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Session Active</p>
                      <p className="text-sm text-gray-600">Studying Topic ID: {session.topic_id}</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleEndSession}
                  disabled={loading}
                  className="w-full bg-red-600 text-white py-3 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Ending session...
                    </>
                  ) : (
                    'End Session'
                  )}
                </button>
              </>
            ) : (
              <>
                <div className="text-center mb-8">
                  <div className="text-5xl font-bold text-green-600 mb-2">
                    {session.focus_score !== null ? session.focus_score.toFixed(1) : 'N/A'}
                  </div>
                  <p className="text-gray-600">Focus Score</p>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <div>
                      <p className="font-medium text-gray-900">Session Completed</p>
                      <p className="text-sm text-gray-600">
                        Duration: {formatTime(elapsedTime)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-center text-gray-600">
                  <p>Session ID: {session.id}</p>
                  <p>Topic ID: {session.topic_id}</p>
                </div>

                <button
                  onClick={() => window.location.reload()}
                  className="w-full mt-6 bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Start New Session
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

import { useState, useEffect, useRef } from 'react';
import { startSession, endSession } from '../api/client';
import type { StudySessionOut, StudySessionStart } from '../api/types';

export const useSession = () => {
  const [session, setSession] = useState<StudySessionOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startNewSession = async (data: StudySessionStart) => {
    setLoading(true);
    setError(null);
    setElapsedTime(0);

    try {
      const sessionData = await startSession(data);
      setSession(sessionData);
      
      // Start client-side timer
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
      
      return sessionData;
    } catch (err: any) {
      setError('Failed to start session');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const stopSession = async (sessionId: number) => {
    setLoading(true);
    setError(null);

    try {
      const sessionData = await endSession(sessionId);
      setSession(sessionData);
      
      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      return sessionData;
    } catch (err: any) {
      setError('Failed to end session');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return {
    session,
    loading,
    error,
    elapsedTime,
    formatTime,
    startSession: startNewSession,
    endSession: stopSession,
  };
};

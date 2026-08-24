import { useState, useEffect } from 'react';
import { getPlan, createPlan } from '../api/client';
import type { StudyPlanOut, StudyPlanCreate } from '../api/types';

// Helper to decode JWT and get user ID
const getUserIdFromToken = (): number | null => {
  const token = localStorage.getItem('auth_token');
  if (!token) return null;
  
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    return parseInt(decoded.sub, 10);
  } catch {
    return null;
  }
};

export const usePlan = () => {
  const [plan, setPlan] = useState<StudyPlanOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasPlan, setHasPlan] = useState<boolean | null>(null);

  const fetchPlan = async () => {
    const userId = getUserIdFromToken();
    if (!userId) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const planData = await getPlan(userId);
      setPlan(planData);
      setHasPlan(true);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setHasPlan(false);
        setPlan(null);
      } else {
        setError('Failed to load study plan');
        setHasPlan(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const createNewPlan = async (planData: StudyPlanCreate) => {
    setLoading(true);
    setError(null);

    try {
      const newPlan = await createPlan(planData);
      setPlan(newPlan);
      setHasPlan(true);
      return newPlan;
    } catch (err: any) {
      setError('Failed to create study plan');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlan();
  }, []);

  return {
    plan,
    loading,
    error,
    hasPlan,
    refetch: fetchPlan,
    createPlan: createNewPlan,
    userId: getUserIdFromToken(),
  };
};

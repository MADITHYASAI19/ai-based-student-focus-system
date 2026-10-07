import React, { useEffect, useState } from 'react';
import { useNotifications } from '../contexts/NotificationContext';

export const ToastNotification: React.FC = () => {
  const { notifications } = useNotifications();
  const [visibleCelebration, setVisibleCelebration] = useState<string | null>(null);

  // Show celebration toast when a celebration notification is added
  useEffect(() => {
    const celebration = notifications.find(
      n => n.type === 'celebration' && !n.isRead
    );

    if (celebration && celebration.id !== visibleCelebration) {
      setVisibleCelebration(celebration.id);

      // Auto-hide after 4 seconds
      const timer = setTimeout(() => {
        setVisibleCelebration(null);
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [notifications, visibleCelebration]);

  if (!visibleCelebration) return null;

  const celebration = notifications.find(n => n.id === visibleCelebration);
  if (!celebration) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-white rounded-2xl border border-emerald-200 shadow-lg shadow-emerald-500/10 p-5 max-w-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-2xl flex-shrink-0">
            ✓
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-bold text-[#16253b] flex items-center gap-2">
              {celebration.title}
            </h4>
            <p className="text-sm text-[#566478] mt-1">
              {celebration.message}
            </p>
          </div>
          <button
            onClick={() => setVisibleCelebration(null)}
            className="text-[#8b96a8] hover:text-[#16253b] transition-colors p-1"
            aria-label="Close toast"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

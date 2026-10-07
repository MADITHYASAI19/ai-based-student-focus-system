import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Notification, StudyPlanOut } from '../api/types';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  generateScheduleNotifications: (plan: StudyPlanOut) => void;
  celebrateCompletion: (topicName: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [processedItems, setProcessedItems] = useState<Set<string>>(new Set());

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) => {
    const newNotification: Notification = {
      ...notification,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    setNotifications(prev => [newNotification, ...prev]);
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, isRead: true } : n)
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const celebrateCompletion = useCallback((topicName: string) => {
    addNotification({
      type: 'celebration',
      title: 'Nice work! 🎉',
      message: `You completed "${topicName}". Keep the momentum going!`,
      topicName,
    });
  }, [addNotification]);

  const generateScheduleNotifications = useCallback((plan: StudyPlanOut) => {
    const now = new Date();
    const upcomingThreshold = 15 * 60 * 1000; // 15 minutes in ms
    const overdueThreshold = -1 * 60 * 60 * 1000; // 1 hour ago in ms

    plan.items.forEach(item => {
      if (!item.scheduled_date) return;

      const scheduledTime = new Date(item.scheduled_date);
      const timeDiff = scheduledTime.getTime() - now.getTime();
      const itemKey = `${item.id}-${scheduledTime.toISOString()}`;

      // Skip if we've already processed this item for this time
      if (processedItems.has(itemKey)) return;

      // Don't notify for completed items
      if (item.status === 'done') return;

      // Upcoming study (within 15 minutes)
      if (timeDiff > 0 && timeDiff <= upcomingThreshold) {
        addNotification({
          type: 'upcoming_study',
          title: '📚 Upcoming Study',
          message: `"${item.topic_name}" is scheduled to start in ${Math.ceil(timeDiff / 60000)} minutes.`,
          topicName: item.topic_name,
          scheduledTime: item.scheduled_date,
        });
        setProcessedItems(prev => new Set([...prev, itemKey]));
      }
      // Study starting now (within 1 minute)
      else if (timeDiff > -60000 && timeDiff <= 0) {
        addNotification({
          type: 'study_starting',
          title: '⏰ Study Time',
          message: `It's time to study "${item.topic_name}". Your scheduled session starts now.`,
          topicName: item.topic_name,
          scheduledTime: item.scheduled_date,
        });
        setProcessedItems(prev => new Set([...prev, itemKey]));
      }
      // Overdue study (more than 1 hour past)
      else if (timeDiff < overdueThreshold && item.status === 'pending') {
        addNotification({
          type: 'study_overdue',
          title: '⚠️ Study Reminder',
          message: `"${item.topic_name}" was scheduled earlier and is still incomplete.`,
          topicName: item.topic_name,
          scheduledTime: item.scheduled_date,
        });
        setProcessedItems(prev => new Set([...prev, itemKey]));
      }
    });
  }, [addNotification, processedItems]);

  // Auto-remove celebration notifications after 5 seconds
  useEffect(() => {
    const celebrationNotifications = notifications.filter(n => n.type === 'celebration' && !n.isRead);
    if (celebrationNotifications.length > 0) {
      const timer = setTimeout(() => {
        celebrationNotifications.forEach(n => markAsRead(n.id));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notifications, markAsRead]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearNotification,
        generateScheduleNotifications,
        celebrateCompletion,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

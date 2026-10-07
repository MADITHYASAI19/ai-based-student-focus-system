import React, { useState, useRef, useEffect } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import type { Notification } from '../api/types';

export const NotificationPanel: React.FC = () => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotification } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'upcoming_study':
        return '📚';
      case 'study_starting':
        return '⏰';
      case 'study_completed':
        return '✓';
      case 'study_overdue':
        return '⚠️';
      case 'quiz_reminder':
        return '📝';
      case 'celebration':
        return '🎉';
      default:
        return '🔔';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  const formatScheduledTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 0) return 'Started';
    if (diffMins < 60) return `Starts in ${diffMins}m`;
    if (diffMins < 1440) return `Starts in ${Math.floor(diffMins / 60)}h`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Notification Bell */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative text-xl text-[#16253b] hover:text-[#24425f] transition-colors p-1"
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-[#e5322d]">
            {unreadCount > 1 && (
              <span className="absolute -top-1 -right-1 bg-[#e5322d] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </span>
        )}
      </button>

      {/* Notification Panel Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl border border-[#e6eaf0] shadow-lg shadow-[#16253b]/10 z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#e6eaf0] bg-gradient-to-r from-[#f3f9fd] to-white flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#16253b]">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs font-medium text-[#24425f] hover:text-[#1d3a5a] transition-colors"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="text-4xl mb-2">✓</div>
                <p className="text-sm font-semibold text-[#16253b]">You're all caught up.</p>
                <p className="text-xs text-[#566478] mt-1">No new notifications.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#e6eaf0]">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => {
                      if (!notification.isRead) {
                        markAsRead(notification.id);
                      }
                      if (notification.action?.onClick) {
                        notification.action.onClick();
                      }
                    }}
                    className={`px-4 py-3 cursor-pointer transition-colors hover:bg-[#f3f9fd] ${
                      !notification.isRead ? 'bg-[#f3f9fd]/50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className="text-lg flex-shrink-0 mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-[#16253b] truncate">
                            {notification.title}
                          </p>
                          {!notification.isRead && (
                            <span className="w-2 h-2 rounded-full bg-[#24425f] flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-[#566478] mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                        {notification.topicName && (
                          <p className="text-xs font-medium text-[#24425f] mt-1 truncate">
                            {notification.topicName}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[11px] text-[#8b96a8]">
                            {formatTimeAgo(notification.createdAt)}
                          </span>
                          {notification.scheduledTime && notification.type !== 'celebration' && (
                            <span className="text-[11px] font-medium text-[#24425f]">
                              {formatScheduledTime(notification.scheduledTime)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Dismiss button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          clearNotification(notification.id);
                        }}
                        className="text-[#8b96a8] hover:text-[#e5322d] transition-colors flex-shrink-0 p-1"
                        aria-label="Dismiss notification"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-[#e6eaf0] bg-[#f3f9fd]/30">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full text-xs font-medium text-[#566478] hover:text-[#16253b] transition-colors"
              >
                Close panel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

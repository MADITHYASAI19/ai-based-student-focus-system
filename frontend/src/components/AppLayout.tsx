import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { NotificationPanel } from './NotificationPanel';
import { ToastNotification } from './ToastNotification';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const getEmail = (): string => {
    if (!token) return 'student@study.local';
    try {
      const parts = token.split('.');
      if (parts.length > 1) {
        const payload = JSON.parse(atob(parts[1]));
        return payload.email || 'Student';
      }
    } catch {
      // ignore decode error
    }
    return 'Student';
  };

  const email = getEmail();
  const initial = email.charAt(0).toUpperCase();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    {
      to: '/planner',
      label: 'Study Planner',
      icon: (
        <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>
        </svg>
      ),
    },
    {
      to: '/session',
      label: 'Focus Session',
      icon: (
        <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9"/>
          <path d="M12 7v5l3 2"/>
        </svg>
      ),
    },
    {
      to: '/quiz',
      label: 'AI Quizzes',
      icon: (
        <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <rect x="4" y="3" width="16" height="18" rx="3"/>
          <path d="M8 9h8M8 13h4"/>
        </svg>
      ),
    },
    {
      to: '/doubts',
      label: 'Doubt Solver',
      icon: (
        <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M21 12a8 8 0 0 1-12 7l-5 1 1.5-4.5A8 8 0 1 1 21 12z"/>
          <path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-[#f4f6f8] flex flex-col md:flex-row">
      {/* Toast Notification */}
      <ToastNotification />

      {/* Mobile Sidebar Toggle */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-[#e6eaf0] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#24425f] text-white flex items-center justify-center font-bold text-sm">
            AI
          </div>
          <span className="font-bold text-[#16253b]">Study Companion</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg text-[#566478] hover:bg-[#eef2f6]"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar - Fixed on desktop, slide-out on mobile */}
      <aside className={`fixed md:fixed top-0 left-0 h-screen z-50 bg-gradient-to-b from-white via-[#f3f9fd] to-[#fbeee4] border-r border-[#e6eaf0] p-5 md:p-4 md:pb-0 overflow-y-auto flex flex-col gap-6 w-[250px] transform transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-1">
          <div className="w-11 h-11 rounded-xl bg-[#24425f] text-white flex items-center justify-center font-bold text-lg shadow-md">
            AI
          </div>
          <div>
            <b className="block text-lg font-extrabold text-[#16253b] leading-tight">Study Companion</b>
            <small className="text-[11.5px] text-[#566478]">Adaptive Learning</small>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-[14.5px] font-medium transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-[#1d3a5a] to-[#2e4a67] text-white shadow-lg shadow-[#1d3a5a]/28 font-semibold'
                    : 'text-[#16253b] hover:bg-[rgba(36,66,95,0.07)]'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom Section */}
        <div className="mt-auto pt-4">
          <div className="h-px bg-[#e6eaf0] my-4 mx-2" />
          
          {/* Secondary Nav */}
          <nav className="flex flex-col gap-1 mb-6">
            <NavLink
              to="/profile"
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-[14.5px] font-medium transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-[#1d3a5a] to-[#2e4a67] text-white shadow-lg shadow-[#1d3a5a]/28 font-semibold'
                    : 'text-[#16253b] hover:bg-[rgba(36,66,95,0.07)]'
                }`
              }
            >
              <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="4"/>
                <path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>
              </svg>
              My Profile
            </NavLink>
          </nav>

          {/* Motivational Quote */}
          <div className="mx-2 mb-4 bg-white/85 border border-[#e6eaf0] rounded-2xl p-3.5 text-[13.5px] text-[#566478] italic flex gap-2 justify-between">
            <span>"A little progress every day adds up to big results."</span>
            <span>🌱</span>
          </div>

          {/* Motivational Text */}
          <div className="px-2 pb-6">
            <div className="font-extrabold text-[15.5px] text-[#16253b] leading-relaxed">
              Stay<br/>Consistent
              <span className="block font-medium text-[#4a6a82] text-[13px]">Keep Learning</span>
              <span className="block font-medium text-[#4a6a82] text-[13px]">Keep Growing</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen md:ml-[250px] pt-16 md:pt-0">
        {/* Top Bar - Fixed on desktop */}
        <div className="sticky top-0 z-30 bg-white border-b border-[#e6eaf0] px-6 py-2.5 flex items-center justify-between gap-4">
          {/* Search */}
          <div className="hidden sm:flex flex-0-1 max-w-[520px] items-center gap-2.5 border border-[#e6eaf0] rounded-xl px-3.5 py-2.5 text-[#8b96a8] bg-white">
            <span>🔍</span>
            <span className="flex-1 text-sm">Search topics, subjects, quizzes...</span>
            <kbd className="bg-[#eef2f6] rounded-md px-2 py-0.5 text-[12px] font-medium text-[#566478]">Ctrl + K</kbd>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3 ml-auto">
            {/* Notification Panel */}
            <NotificationPanel />

            {/* User Profile */}
            <button
              onClick={() => navigate('/profile')}
              className="flex items-center gap-3 border border-[#e6eaf0] rounded-xl px-3.5 py-1.5 text-sm font-medium text-[#16253b] hover:border-[#24425f] transition-colors cursor-pointer"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1d3a5a] to-[#2e4a67] text-white flex items-center justify-center font-bold">
                {initial}
              </div>
              <span className="hidden sm:block truncate max-w-[150px]">{email}</span>
              <span className="text-[#8b96a8]">⌄</span>
            </button>

            {/* Sign Out (desktop) */}
            <button
              onClick={handleLogout}
              className="hidden md:block px-3 py-1.5 text-xs font-medium text-[#566478] hover:text-red-600 hover:bg-red-50 border border-[#e6eaf0] hover:border-red-200 rounded-lg transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Page Content - Scrollable independently */}
        <main className="flex-1 p-6 sm:p-8 max-w-[1100px] w-full mx-auto overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

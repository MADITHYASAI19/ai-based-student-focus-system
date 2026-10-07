import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setToken } = useAuth();

  const handleFillDemo = () => {
    setEmail('student@studyplatform.local');
    setPassword('StudentPass123!');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!email.trim()) {
      setError('Please enter your email address.');
      setLoading(false);
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      setLoading(false);
      return;
    }

    try {
      const response = await login({ email, password });
      setToken(response.access_token);
      navigate('/planner');
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError('Invalid email or password. Please check your details and try again.');
      } else if (err.code === 'ERR_NETWORK' || !err.response) {
        setError('We couldn\'t connect to the server. Please check your connection and try again.');
      } else if (err.response?.status >= 500) {
        setError('Something went wrong on our side. Please try again in a moment.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#eaf3fc] to-[#fbeee4] p-4 sm:p-6">
      <div className="max-w-md w-full bg-white border border-[#e6eaf0] rounded-2xl shadow-lg p-8 sm:p-10">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#24425f] text-white shadow-lg mb-1">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#16253b] tracking-tight">
            Welcome back
          </h1>
          <p className="text-sm text-[#566478]">
            Sign in to open your study plans, focus sessions and AI tutor.
          </p>
        </div>

        {/* Demo Credentials Quick Fill Banner */}
        <div className="mt-6 p-3.5 bg-[#e8f1fc] border border-[#d4e3f3] rounded-xl flex items-center justify-between gap-3">
          <div className="text-xs text-[#24425f] leading-tight">
            <span className="font-semibold block text-[#1d3a5a]">Demo account</span>
            <span className="text-[#566478]">student@studyplatform.local</span>
          </div>
          <button
            type="button"
            onClick={handleFillDemo}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#24425f] text-white hover:bg-[#1d3a5a] active:scale-95 transition-all shadow-xs cursor-pointer whitespace-nowrap"
          >
            Auto-fill
          </button>
        </div>

        {/* Form */}
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
              <svg className="w-5 h-5 flex-shrink-0 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#16253b] mb-1.5">
              Email address
            </label>
            <input
              type="email"
              required
              className="w-full px-3.5 py-2.5 bg-white border border-[#e6eaf0] rounded-xl text-[#16253b] placeholder-[#8b96a8] focus:outline-none focus:ring-2 focus:ring-[#24425f] focus:border-[#24425f] transition-all text-sm"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#16253b] mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              className="w-full px-3.5 py-2.5 bg-white border border-[#e6eaf0] rounded-xl text-[#16253b] placeholder-[#8b96a8] focus:outline-none focus:ring-2 focus:ring-[#24425f] focus:border-[#24425f] transition-all text-sm"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#1d3a5a] to-[#2e4a67] hover:from-[#16253b] hover:to-[#24425f] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#24425f] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-[#1d3a5a]/25 active:scale-[0.99] cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </div>

          <div className="text-center pt-2">
            <span className="text-xs text-[#566478]">
              New here?{' '}
              <Link
                to="/register"
                className="font-semibold text-[#24425f] hover:text-[#1d3a5a] hover:underline"
              >
                Create an account
              </Link>
            </span>
          </div>
        </form>
      </div>
    </div>
  );
};

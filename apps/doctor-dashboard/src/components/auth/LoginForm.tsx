// AUTH INTEGRATION POINT:
// onLogin(email, password, role) is called on submit (Log In tab).
// Wire this to your JWT auth endpoint: POST /api/auth/login
// Expected response: { token: string, role: 'doctor' | 'receptionist' }
// Store token in memory (not localStorage) and pass to API calls.
// isLoading and error are controlled by the parent — update parent
// state based on API response.
//
// onSignUp(fullName, email, password, role) is called on submit (Sign Up tab).
// Wire this to your registration endpoint: POST /api/auth/register

import React, { useState } from 'react';

interface LoginFormProps {
  role: 'doctor' | 'receptionist';
  onBack: () => void;
  onLogin: (email: string, password: string) => void;
  onSignUp?: (fullName: string, email: string, password: string, role: string) => void;
  isLoading: boolean;
  error: string | null;
}

const LoginForm: React.FC<LoginFormProps> = ({
  role,
  onBack,
  onLogin,
  onSignUp,
  isLoading,
  error,
}) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  // Shared fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Sign Up–only fields
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Client-side validation error (passwords-don't-match etc.)
  const [localError, setLocalError] = useState<string | null>(null);

  const roleLabel = role === 'doctor' ? 'Doctor' : 'Receptionist';
  const roleIcon = role === 'doctor' ? 'stethoscope' : 'person_add';

  // ── Tab switch — clear local validation but preserve field values ──────────
  const handleModeSwitch = (next: 'login' | 'signup') => {
    setMode(next);
    setLocalError(null);
  };

  // ── Submit handlers ──────────────────────────────────────────────────────────
  const handleSignIn = () => {
    setLocalError(null);
    onLogin(email, password);
  };

  const handleCreateAccount = () => {
    setLocalError(null);
    if (!fullName.trim()) {
      setLocalError('Full name is required.');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters.');
      return;
    }
    onSignUp?.(fullName.trim(), email, password, role);
  };

  // ── Shared input styling helpers ─────────────────────────────────────────────
  const inputClass =
    'w-full rounded-xl border bg-white px-4 py-3 text-sm transition-all duration-200 focus:outline-none';
  const inputStyle = { borderColor: 'rgba(79,143,168,0.3)', color: '#1a2e35' };
  const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = '#4F8FA8';
    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(79,143,168,0.4)';
  };
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'rgba(79,143,168,0.3)';
    e.currentTarget.style.boxShadow = 'none';
  };

  // Display either the parent-supplied error or our local validation error
  const displayError = localError ?? error;

  return (
    <div className="flex flex-row h-screen">
      {/* ── Left Panel ── */}
      <div
        className="hidden md:flex relative w-2/5 flex-col items-center justify-center overflow-hidden"
        style={{ backgroundColor: '#4F8FA8' }}
      >
        {/* Brand mark */}
        <div className="flex flex-row items-center gap-3">
          <span
            className="material-symbols-outlined text-[40px] text-white"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            vital_signs
          </span>
          <span className="text-3xl font-bold text-white">OptiTriage</span>
        </div>

        {/* Tagline */}
        <p className="mt-6 text-white/70 text-sm font-medium tracking-widest uppercase">
          Calm. Accurate. Fast.
        </p>

        {/* Role indicator pill */}
        <div className="mt-16 flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-2">
          <span
            className="material-symbols-outlined text-[18px] text-white/80"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {roleIcon}
          </span>
          <span className="text-white/80 text-sm font-medium">
            {mode === 'signup' ? `Joining as ${roleLabel}` : `Signed in as ${roleLabel}`}
          </span>
        </div>

        {/* Decorative background icon */}
        <span
          className="material-symbols-outlined text-[160px] text-white/5 absolute bottom-[-20px] right-[-20px] pointer-events-none select-none"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          monitor_heart
        </span>
      </div>

      {/* ── Right Panel ── */}
      <div
        className="flex-1 flex flex-col items-center justify-center relative"
        style={{ backgroundColor: '#FDF1DB' }}
      >
        {/* Back button */}
        <button
          onClick={onBack}
          className="absolute top-6 left-6 flex items-center gap-1.5 text-xs transition-colors duration-200 cursor-pointer"
          style={{ color: '#7A8C85' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#4F8FA8')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#7A8C85')}
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Change role
        </button>

        {/* Inner container */}
        <div className="w-full max-w-sm px-6">
          {/* Heading */}
          <h1 className="font-bold text-2xl" style={{ color: '#1a2e35' }}>
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h1>
          <p className="text-sm mt-1" style={{ color: '#7A8C85' }}>
            {mode === 'login'
              ? `Sign in to your ${roleLabel} account`
              : `Register as a ${roleLabel}`}
          </p>

          {/* ── Log In / Sign Up tab toggle ────────────────────────────────── */}
          <div
            className="mt-6 flex rounded-xl p-1 gap-1"
            style={{ backgroundColor: 'rgba(79,143,168,0.1)' }}
            role="tablist"
            aria-label="Authentication mode"
          >
            {(['login', 'signup'] as const).map((tab) => {
              const active = mode === tab;
              return (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={active}
                  onClick={() => handleModeSwitch(tab)}
                  className="flex-1 rounded-lg py-2 text-sm font-semibold transition-all duration-200"
                  style={{
                    backgroundColor: active ? '#4F8FA8' : 'transparent',
                    color: active ? '#ffffff' : '#4F8FA8',
                    boxShadow: active ? '0 1px 4px rgba(79,143,168,0.3)' : 'none',
                  }}
                >
                  {tab === 'login' ? 'Log In' : 'Sign Up'}
                </button>
              );
            })}
          </div>

          {/* ── Sign Up extra field: Full name ──────────────────────────────── */}
          {mode === 'signup' && (
            <div className="mt-6">
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: '#1a2e35' }}
              >
                Full name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Dr. Jane Smith"
                className={inputClass}
                style={inputStyle}
                onFocus={onFocus}
                onBlur={onBlur}
                autoComplete="name"
              />
            </div>
          )}

          {/* ── Email field (both modes) ─────────────────────────────────────── */}
          <div className={mode === 'signup' ? 'mt-4' : 'mt-8'}>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: '#1a2e35' }}
            >
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@hospital.com"
              className={inputClass}
              style={inputStyle}
              onFocus={onFocus}
              onBlur={onBlur}
              autoComplete="email"
            />
          </div>

          {/* ── Password field (both modes) ──────────────────────────────────── */}
          <div className="mt-4">
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: '#1a2e35' }}
            >
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`${inputClass} pr-10`}
                style={inputStyle}
                onFocus={onFocus}
                onBlur={onBlur}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-200"
                style={{ color: '#7A8C85' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#4F8FA8')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#7A8C85')}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          {/* ── Sign Up extra field: Confirm password ───────────────────────── */}
          {mode === 'signup' && (
            <div className="mt-4">
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: '#1a2e35' }}
              >
                Confirm password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`${inputClass} pr-10`}
                  style={inputStyle}
                  onFocus={onFocus}
                  onBlur={onBlur}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-200"
                  style={{ color: '#7A8C85' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#4F8FA8')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#7A8C85')}
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showConfirmPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ── Error banner ─────────────────────────────────────────────────── */}
          {displayError !== null && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{displayError}</span>
            </div>
          )}

          {/* ── Submit button ────────────────────────────────────────────────── */}
          <button
            onClick={mode === 'login' ? handleSignIn : handleCreateAccount}
            disabled={isLoading}
            className="mt-6 w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-colors duration-200"
            style={{
              backgroundColor: '#4F8FA8',
              opacity: isLoading ? 0.6 : 1,
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!isLoading) e.currentTarget.style.backgroundColor = '#3d7a91';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#4F8FA8';
            }}
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                {mode === 'login' ? 'Signing in…' : 'Creating account…'}
              </>
            ) : mode === 'login' ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;

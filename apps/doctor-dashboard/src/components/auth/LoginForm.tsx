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

import React, { useState, useEffect, useRef, type CSSProperties } from 'react';

// ─── Isolated auth-* keyframes — prefixed to never conflict with rs-* or fd-* ─

const AUTH_KEYFRAMES = `
  /* ── Left panel horizontal reveal (clip-path LEFT → RIGHT) ── */
  @keyframes auth-panel-enter {
    0%   { clip-path: inset(0 100% 0 0); opacity: 0.6; }
    100% { clip-path: inset(0 0%   0 0); opacity: 1; }
  }

  /* ── Generic content fade + translate-up ── */
  @keyframes auth-content-enter {
    0%   { opacity: 0; transform: translateY(14px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  /* ── Form field stagger: bottom → up ── */
  @keyframes auth-field-enter {
    0%   { opacity: 0; transform: translateY(24px) scale(0.98); }
    100% { opacity: 1; transform: translateY(0)   scale(1); }
  }

  /* ── Ambient decoration breathing on the decorative icon ── */
  @keyframes auth-ambient-pulse {
    0%,  100% { opacity: 0.04; transform: scale(1)     rotate(-6deg); }
    50%        { opacity: 0.07; transform: scale(1.025) rotate(-6deg); }
  }

  /* ── Reduced-motion overrides: instantly show, no motion ── */
  @media (prefers-reduced-motion: reduce) {
    .auth-panel-animate   { animation: none !important; clip-path: none !important; opacity: 1 !important; }
    .auth-content-animate { animation: none !important; opacity: 1 !important; transform: none !important; }
    .auth-field-animate   { animation: none !important; opacity: 1 !important; transform: none !important; }
    .auth-ambient-animate { animation: none !important; }
  }
`;

// ─── useEntrance — fires once on mount ───────────────────────────────────────

function useEntrance(): boolean {
  const firedRef = useRef(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setEntered(true);
      });
    });
  }, []);

  return entered;
}

// ─── usePrefersReducedMotion ─────────────────────────────────────────────────

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}

// ─── Animation helpers ────────────────────────────────────────────────────────

/** Returns animation shorthand for content that fades + slides up. */
function contentAnim(
  entered: boolean,
  reduced: boolean,
  delayS: number,
  durationS = 0.7,
): CSSProperties {
  if (reduced) return { opacity: 1, transform: 'none' };
  if (!entered) return { opacity: 0, transform: 'translateY(14px)' };
  return {
    animation: `auth-content-enter ${durationS}s cubic-bezier(0.16, 1, 0.3, 1) ${delayS}s both`,
  };
}

/** Returns animation shorthand for staggered form fields. */
function fieldAnim(
  entered: boolean,
  reduced: boolean,
  delayS: number,
): CSSProperties {
  if (reduced) return { opacity: 1, transform: 'none' };
  if (!entered) return { opacity: 0, transform: 'translateY(24px) scale(0.98)' };
  return {
    animation: `auth-field-enter 0.65s cubic-bezier(0.16, 1, 0.3, 1) ${delayS}s both`,
  };
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface LoginFormProps {
  role: 'doctor' | 'receptionist';
  onBack: () => void;
  onLogin: (email: string, password: string) => void;
  onSignUp?: (fullName: string, email: string, password: string, role: string) => void;
  isLoading: boolean;
  error: string | null;
}

// ─── LoginForm ───────────────────────────────────────────────────────────────

const LoginForm: React.FC<LoginFormProps> = ({
  role,
  onBack,
  onLogin,
  onSignUp,
  isLoading,
  error,
}) => {
  const entered = useEntrance();
  const reduced = usePrefersReducedMotion();

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

  // Track previous mode for form transition direction
  const prevModeRef = useRef<'login' | 'signup'>('login');

  // Switching forms triggers a re-key to animate fields in
  const [formKey, setFormKey] = useState(0);

  const roleLabel = role === 'doctor' ? 'Doctor' : 'Receptionist';
  const roleIcon = role === 'doctor' ? 'stethoscope' : 'person_add';

  // ── Tab switch — clear local validation but preserve field values ──────────
  const handleModeSwitch = (next: 'login' | 'signup') => {
    if (next === mode) return;
    prevModeRef.current = mode;
    setMode(next);
    setLocalError(null);
    // Bump the key so form fields re-animate
    setFormKey((k) => k + 1);
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
  const inputStyle: CSSProperties = {
    borderColor: 'rgba(79,143,168,0.3)',
    color: '#1a2e35',
    fontWeight: 400,
    boxShadow: '3px 4px 10px -3px rgba(79,143,168,0.10), 1px 2px 4px -1px rgba(26,46,53,0.05)',
    transition: 'border-color 200ms ease, box-shadow 200ms ease, transform 180ms cubic-bezier(0.16,1,0.3,1)',
  };

  const onFocusInput = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = '#4F8FA8';
    e.currentTarget.style.boxShadow =
      '0 0 0 3px rgba(79,143,168,0.18), 4px 6px 14px -3px rgba(79,143,168,0.18)';
    e.currentTarget.style.transform = 'translateY(-1px)';
  };
  const onBlurInput = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = 'rgba(79,143,168,0.3)';
    e.currentTarget.style.boxShadow =
      '3px 4px 10px -3px rgba(79,143,168,0.10), 1px 2px 4px -1px rgba(26,46,53,0.05)';
    e.currentTarget.style.transform = 'translateY(0)';
  };
  const onHoverInput = (e: React.MouseEvent<HTMLInputElement>) => {
    if (document.activeElement !== e.currentTarget) {
      e.currentTarget.style.borderColor = 'rgba(79,143,168,0.55)';
      e.currentTarget.style.boxShadow =
        '4px 5px 14px -3px rgba(79,143,168,0.14), 1px 2px 5px -1px rgba(26,46,53,0.06)';
    }
  };
  const onLeaveInput = (e: React.MouseEvent<HTMLInputElement>) => {
    if (document.activeElement !== e.currentTarget) {
      e.currentTarget.style.borderColor = 'rgba(79,143,168,0.3)';
      e.currentTarget.style.boxShadow =
        '3px 4px 10px -3px rgba(79,143,168,0.10), 1px 2px 4px -1px rgba(26,46,53,0.05)';
    }
  };

  // Display either the parent-supplied error or our local validation error
  const displayError = localError ?? error;

  // ── Stagger base delays for form fields (after page entrance) ───────────────
  // These are relative to when the component mounts.
  // Login mode: heading, subtitle, toggle, email, password, button
  // Signup mode: heading, subtitle, toggle, fullName, email, password, confirm, button
  const BASE = 0.25; // seconds before form content starts appearing
  const S = 0.09;    // stagger step between elements

  // Field stagger delays by form position index
  const d = (idx: number) => BASE + idx * S;

  // For mode-switch re-animations, use shorter delays
  const switchBase = 0.05;
  const switchS = 0.07;
  const ds = (idx: number) => switchBase + idx * switchS;

  // Use formKey to decide if we're in "initial entrance" or "mode switch" mode
  const isFirstRender = formKey === 0;
  const delayFn = isFirstRender
    ? (idx: number) => d(idx)
    : (idx: number) => ds(idx);

  // ── Left panel panel animation ───────────────────────────────────────────────
  const panelStyle: CSSProperties = reduced
    ? { opacity: 1 }
    : entered
    ? {
        animation: 'auth-panel-enter 0.65s cubic-bezier(0.16, 1, 0.3, 1) 0s both',
      }
    : { opacity: 0.6, clipPath: 'inset(0 100% 0 0)' };

  return (
    <div className="flex flex-row h-screen">
      {/* ── Inject isolated auth-* keyframes ── */}
      <style>{AUTH_KEYFRAMES}</style>

      {/* ── Left Panel ── */}
      <div
        className="auth-panel-animate hidden md:flex relative w-2/5 flex-col items-center justify-center overflow-hidden"
        style={{ backgroundColor: '#4F8FA8', ...panelStyle }}
      >
        {/* Brand mark */}
        <div
          className="auth-content-animate flex flex-row items-center gap-3"
          style={contentAnim(entered, reduced, 0.15, 0.75)}
        >
          <span
            className="material-symbols-outlined text-[40px] text-white"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            vital_signs
          </span>
          <span className="text-3xl font-bold text-white tracking-tight">OptiTriage</span>
        </div>

        {/* Tagline */}
        <p
          className="auth-content-animate mt-6 text-white/70 text-sm font-medium tracking-widest uppercase"
          style={contentAnim(entered, reduced, 0.30, 0.75)}
        >
          Calm. Accurate. Fast.
        </p>

        {/* Role indicator pill */}
        <div
          className="auth-content-animate mt-16 flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-2"
          style={contentAnim(entered, reduced, 0.45, 0.75)}
        >
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

        {/* Decorative background icon — subtle ambient pulse */}
        <span
          className="auth-ambient-animate material-symbols-outlined absolute bottom-[-20px] right-[-20px] pointer-events-none select-none"
          style={{
            fontSize: '160px',
            color: 'rgba(255,255,255,0.05)',
            fontVariationSettings: "'FILL' 1",
            animation: reduced
              ? 'none'
              : 'auth-ambient-pulse 6s ease-in-out infinite',
          }}
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
          className="absolute top-6 left-6 flex items-center gap-1.5 text-xs cursor-pointer"
          style={{
            color: '#7A8C85',
            transition: 'color 200ms ease, transform 200ms cubic-bezier(0.16,1,0.3,1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#4F8FA8';
            e.currentTarget.style.transform = 'translateX(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#7A8C85';
            e.currentTarget.style.transform = 'translateX(0)';
          }}
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Change role
        </button>

        {/* Inner container */}
        <div
          className="w-full max-w-sm px-8 py-10 rounded-2xl"
          style={{
            backgroundColor: '#ffffff',
            boxShadow: '6px 8px 28px -4px rgba(79,143,168,0.13), 3px 4px 10px -2px rgba(26,46,53,0.07)',
          }}
        >

          {/* Heading */}
          <div
            className="auth-field-animate"
            style={fieldAnim(entered, reduced, delayFn(0))}
          >
            <h1
              className="font-bold text-[1.65rem] leading-tight tracking-tight"
              style={{ color: '#1a2e35', letterSpacing: '-0.02em' }}
            >
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </h1>
            <p
              className="text-sm mt-1.5 leading-relaxed"
              style={{ color: '#7A8C85' }}
            >
              {mode === 'login'
                ? `Sign in to your ${roleLabel} account`
                : `Register as a ${roleLabel}`}
            </p>
          </div>

          {/* ── Log In / Sign Up tab toggle ─────────────────────────────────── */}
          <div
            className="auth-field-animate mt-6"
            style={fieldAnim(entered, reduced, delayFn(1))}
          >
            <div
              className="relative flex rounded-xl p-1 gap-1"
              style={{ backgroundColor: 'rgba(79,143,168,0.1)' }}
              role="tablist"
              aria-label="Authentication mode"
            >
              {/* Sliding active background indicator */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: '4px',
                  bottom: '4px',
                  left: mode === 'login' ? '4px' : 'calc(50% + 2px)',
                  width: 'calc(50% - 6px)',
                  backgroundColor: '#4F8FA8',
                  borderRadius: '10px',
                  boxShadow: '0 1px 4px rgba(79,143,168,0.35)',
                  transition: 'left 280ms cubic-bezier(0.16, 1, 0.3, 1)',
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              />
              {(['login', 'signup'] as const).map((tab) => {
                const active = mode === tab;
                return (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleModeSwitch(tab)}
                    className="flex-1 rounded-lg py-2 text-sm font-semibold relative z-[1]"
                    style={{
                      color: active ? '#ffffff' : '#4F8FA8',
                      backgroundColor: 'transparent',
                      transition: 'color 250ms ease',
                    }}
                  >
                    {tab === 'login' ? 'Log In' : 'Sign Up'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Form fields — re-keyed on mode switch so they re-animate ──── */}
          <div key={formKey}>

            {/* ── Sign Up extra field: Full name ───────────────────────────── */}
            {mode === 'signup' && (
              <div
                className="auth-field-animate mt-6"
                style={fieldAnim(entered, reduced, delayFn(2))}
              >
                <label
                  className="block text-sm font-semibold mb-1.5"
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
                  onFocus={onFocusInput}
                  onBlur={onBlurInput}
                  onMouseEnter={onHoverInput}
                  onMouseLeave={onLeaveInput}
                  autoComplete="name"
                />
              </div>
            )}

            {/* ── Email field (both modes) ─────────────────────────────────── */}
            <div
              className="auth-field-animate"
              style={{
                marginTop: mode === 'signup' ? '1rem' : '2rem',
                ...fieldAnim(entered, reduced, mode === 'signup' ? delayFn(3) : delayFn(2)),
              }}
            >
              <label
                className="block text-sm font-semibold mb-1.5"
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
                onFocus={onFocusInput}
                onBlur={onBlurInput}
                onMouseEnter={onHoverInput}
                onMouseLeave={onLeaveInput}
                autoComplete="email"
              />
            </div>

            {/* ── Password field (both modes) ─────────────────────────────── */}
            <div
              className="auth-field-animate mt-4"
              style={fieldAnim(entered, reduced, mode === 'signup' ? delayFn(4) : delayFn(3))}
            >
              <label
                className="block text-sm font-semibold mb-1.5"
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
                  onFocus={onFocusInput}
                  onBlur={onBlurInput}
                  onMouseEnter={onHoverInput}
                  onMouseLeave={onLeaveInput}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{
                    color: '#7A8C85',
                    transition: 'color 180ms ease, transform 180ms cubic-bezier(0.16,1,0.3,1)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#4F8FA8';
                    e.currentTarget.style.transform = 'translateY(-50%) scale(1.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#7A8C85';
                    e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                  }}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <span
                    className="material-symbols-outlined text-[18px]"
                    style={{ transition: 'opacity 150ms ease' }}
                  >
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {/* ── Sign Up extra field: Confirm password ───────────────────── */}
            {mode === 'signup' && (
              <div
                className="auth-field-animate mt-4"
                style={fieldAnim(entered, reduced, delayFn(5))}
              >
                <label
                  className="block text-sm font-semibold mb-1.5"
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
                    onFocus={onFocusInput}
                    onBlur={onBlurInput}
                    onMouseEnter={onHoverInput}
                    onMouseLeave={onLeaveInput}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{
                      color: '#7A8C85',
                      transition: 'color 180ms ease, transform 180ms cubic-bezier(0.16,1,0.3,1)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#4F8FA8';
                      e.currentTarget.style.transform = 'translateY(-50%) scale(1.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#7A8C85';
                      e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                    }}
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    <span
                      className="material-symbols-outlined text-[18px]"
                      style={{ transition: 'opacity 150ms ease' }}
                    >
                      {showConfirmPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* ── Error banner ─────────────────────────────────────────────── */}
            {displayError !== null && (
              <div
                className="auth-field-animate mt-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
                style={fieldAnim(entered, reduced, 0)}
              >
                <span className="material-symbols-outlined text-[16px]">error</span>
                <span>{displayError}</span>
              </div>
            )}

            {/* ── Submit button ──────────────────────────────────────────── */}
            <div
              className="auth-field-animate mt-6"
              style={fieldAnim(
                entered,
                reduced,
                mode === 'signup' ? delayFn(6) : delayFn(4),
              )}
            >
              <button
                onClick={mode === 'login' ? handleSignIn : handleCreateAccount}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white"
                style={{
                  backgroundColor: '#4F8FA8',
                  opacity: isLoading ? 0.65 : 1,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition:
                    'background-color 200ms ease, box-shadow 200ms ease, transform 160ms cubic-bezier(0.16,1,0.3,1), opacity 200ms ease',
                  boxShadow: '0 2px 8px rgba(79,143,168,0.25)',
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = '#3d7a91';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(79,143,168,0.38)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#4F8FA8';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(79,143,168,0.25)';
                }}
                onMouseDown={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.transform = 'translateY(0px)';
                    e.currentTarget.style.boxShadow = '0 1px 4px rgba(79,143,168,0.20)';
                  }
                }}
                onMouseUp={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(79,143,168,0.38)';
                  }
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

          </div>{/* end formKey keyed div */}
        </div>
      </div>
    </div>
  );
};

export default LoginForm;

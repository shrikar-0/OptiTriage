/**
 * src/components/NewPatientScanForm.tsx
 *
 * "New Patient Scan" form — receptionist enters patient details and clicks
 * "Generate Link" or "Generate & Send via WhatsApp". Renders one of four states:
 *
 *   idle     → form inputs + submit button
 *   loading  → spinner, button disabled, inputs locked
 *   success  → form resets, onSuccess fires
 *   error    → inline error message, form re-enabled for retry
 *
 * ⚠️  PRIVACY: The phone number only lives in React's controlled-input state
 *     while the user is typing. On successful submission it is cleared from
 *     state. It is never written to localStorage, sessionStorage, or any
 *     analytics call.
 */

import React, { useState, useEffect, useRef, type FormEvent, type CSSProperties } from 'react';
import { useCreateSession } from '../hooks/useCreateSession';

// ─── Scoped keyframes (ri- prefix: receptionist-intake) ────────────────────────

const RI_FORM_KEYFRAMES = `
  @keyframes ri-field-enter {
    0%   { opacity: 0; transform: translateY(18px) scale(0.98); }
    100% { opacity: 1; transform: translateY(0)   scale(1); }
  }

  @media (prefers-reduced-motion: reduce) {
    .ri-field-animate { animation: none !important; opacity: 1 !important; transform: none !important; }
  }
`;

// ─── Animation helpers ─────────────────────────────────────────────────────────

function useEntrance(): boolean {
  const firedRef = useRef(false);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
  }, []);
  return entered;
}

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

function fieldAnim(entered: boolean, reduced: boolean, delayS: number): CSSProperties {
  if (reduced) return { opacity: 1, transform: 'none' };
  if (!entered) return { opacity: 0, transform: 'translateY(18px) scale(0.98)' };
  return {
    animation: `ri-field-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delayS}s both`,
  };
}

// ─── Input interaction helpers ─────────────────────────────────────────────────

const INPUT_CLASS =
  'w-full rounded-xl border bg-white py-3 text-sm transition-all duration-200 focus:outline-none';

const inputStyle = (hasError?: boolean): CSSProperties => ({
  borderColor: hasError ? 'rgba(239,68,68,0.7)' : 'rgba(79,143,168,0.3)',
  color: '#1a2e35',
  boxShadow: '3px 4px 10px -3px rgba(79,143,168,0.08), 1px 2px 4px -1px rgba(26,46,53,0.04)',
  transition: 'border-color 200ms ease, box-shadow 200ms ease, transform 180ms cubic-bezier(0.16,1,0.3,1)',
});

const onFocusInput = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = '#4F8FA8';
  e.currentTarget.style.boxShadow =
    '0 0 0 3px rgba(79,143,168,0.15), 4px 5px 14px -3px rgba(79,143,168,0.14)';
  e.currentTarget.style.transform = 'translateY(-1px)';
};

const onBlurInput = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = 'rgba(79,143,168,0.3)';
  e.currentTarget.style.boxShadow =
    '3px 4px 10px -3px rgba(79,143,168,0.08), 1px 2px 4px -1px rgba(26,46,53,0.04)';
  e.currentTarget.style.transform = 'translateY(0)';
};

const onHoverInput = (e: React.MouseEvent<HTMLInputElement>) => {
  if (document.activeElement !== e.currentTarget) {
    e.currentTarget.style.borderColor = 'rgba(79,143,168,0.55)';
    e.currentTarget.style.boxShadow =
      '4px 5px 14px -3px rgba(79,143,168,0.12), 1px 2px 5px -1px rgba(26,46,53,0.05)';
  }
};

const onLeaveInput = (e: React.MouseEvent<HTMLInputElement>) => {
  if (document.activeElement !== e.currentTarget) {
    e.currentTarget.style.borderColor = 'rgba(79,143,168,0.3)';
    e.currentTarget.style.boxShadow =
      '3px 4px 10px -3px rgba(79,143,168,0.08), 1px 2px 4px -1px rgba(26,46,53,0.04)';
  }
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function NewPatientScanForm({ accessToken, onSuccess }: { accessToken: string, onSuccess: (data: { patientName: string, patientAge?: number, scanUrl: string, sessionId: string, status: 'WAITING' }) => void }) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const { state, submit, reset } = useCreateSession();

  const entered = useEntrance();
  const reduced = usePrefersReducedMotion();

  const isLoading = state.status === 'loading';
  const nameError = nameTouched && !name.trim() ? 'Patient name is required.' : null;
  const canSubmit = name.trim().length > 0 && !isLoading;

  const hasPhone = phone.trim().length > 0;

  // Stagger timing
  const BASE = 0.08;
  const S = 0.08;
  const d = (i: number) => BASE + i * S;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setNameTouched(true);
    if (!canSubmit) return;

    const parsedAge = age.trim() ? parseInt(age.trim(), 10) : undefined;
    // Pass phone to backend — the WhatsApp gateway will dispatch the link silently
    const result = await submit(phone.trim() || undefined, name.trim(), parsedAge, accessToken);

    if (result.ok && result.data) {
      const scanUrl = result.data.triageLink || result.data.scanUrl;

      onSuccess({
        patientName: name.trim(),
        patientAge: parsedAge,
        scanUrl,
        sessionId: result.data.sessionId,
        status: 'WAITING',
      });
      // Form resets immediately so next patient can be registered
      setName('');
      setAge('');
      setPhone('');
      setNameTouched(false);
      reset();
    }
  }


  // ── Idle / loading / error state ─────────────────────────────────────────────
  return (
    <>
      <style>{RI_FORM_KEYFRAMES}</style>
      <form
        id="new-patient-scan-form"
        onSubmit={handleSubmit}
        noValidate
        aria-label="New patient scan"
        className="flex flex-col gap-1"
      >
        {/* Section label */}
        <div
          className="ri-field-animate"
          style={fieldAnim(entered, reduced, d(0))}
        >
          <span
            className="block text-[10px] font-semibold uppercase tracking-[0.18em] mb-4"
            style={{ color: '#9E6B40' }}
          >
            Patient Information
          </span>
        </div>

        {/* Patient name — full width */}
        <div
          className="ri-field-animate flex flex-col gap-1.5 mb-3"
          style={fieldAnim(entered, reduced, d(1))}
        >
          <label
            htmlFor="patient-name-input"
            className="text-sm font-semibold"
            style={{ color: '#1a2e35' }}
          >
            Patient name
          </label>
          <div className="relative">
            <span
              className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[17px] pointer-events-none"
              style={{ color: '#7A8C85', fontVariationSettings: "'FILL' 0" }}
            >
              person
            </span>
            <input
              id="patient-name-input"
              type="text"
              autoComplete="off"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setNameTouched(true)}
              disabled={isLoading}
              className={`${INPUT_CLASS} pl-10 pr-4`}
              style={inputStyle(!!nameError)}
              onFocus={onFocusInput}
              onMouseEnter={onHoverInput}
              onMouseLeave={onLeaveInput}
            />
          </div>
          {nameError && (
            <p className="text-xs" style={{ color: '#b91c1c' }}>{nameError}</p>
          )}
        </div>

        {/* Age + Phone — side by side on desktop */}
        <div
          className="ri-field-animate flex flex-col sm:flex-row gap-3 mb-3"
          style={fieldAnim(entered, reduced, d(2))}
        >
          {/* Age */}
          <div className="flex flex-col gap-1.5 sm:w-[140px] shrink-0">
            <label
              htmlFor="patient-age-input"
              className="text-sm font-semibold"
              style={{ color: '#1a2e35' }}
            >
              Age
              <span className="text-xs font-normal ml-1" style={{ color: '#7A8C85' }}>
                (optional)
              </span>
            </label>
            <div className="relative">
              <span
                className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[17px] pointer-events-none"
                style={{ color: '#7A8C85', fontVariationSettings: "'FILL' 0" }}
              >
                calendar_month
              </span>
              <input
                id="patient-age-input"
                type="number"
                min={0}
                max={130}
                placeholder="Years"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                disabled={isLoading}
                className={`${INPUT_CLASS} pl-10 pr-4`}
                style={inputStyle()}
                onFocus={onFocusInput}
                onBlur={onBlurInput}
                onMouseEnter={onHoverInput}
                onMouseLeave={onLeaveInput}
              />
            </div>
          </div>

          {/* Phone */}
          <div className="flex flex-col gap-1.5 flex-1">
            <label
              htmlFor="patient-phone-input"
              className="text-sm font-semibold"
              style={{ color: '#1a2e35' }}
            >
              Phone number
              <span className="text-xs font-normal ml-1" style={{ color: '#7A8C85' }}>
                (optional)
              </span>
            </label>
            <div className="relative">
              <span
                className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[17px] pointer-events-none"
                style={{ color: '#7A8C85', fontVariationSettings: "'FILL' 0" }}
              >
                phone
              </span>
              <input
                id="patient-phone-input"
                type="tel"
                autoComplete="tel"
                placeholder="+1 555-555-5555"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isLoading}
                className={`${INPUT_CLASS} pl-10 pr-4`}
                style={inputStyle()}
                onFocus={onFocusInput}
                onBlur={onBlurInput}
                onMouseEnter={onHoverInput}
                onMouseLeave={onLeaveInput}
              />
            </div>
            {/* Phone helper text */}
            <div className="flex items-center gap-1.5 mt-0.5 min-h-[18px]">
              {hasPhone ? (
                <>
                  <span
                    className="material-symbols-outlined text-[14px]"
                    style={{ color: '#22c55e', fontVariationSettings: "'FILL' 1" }}
                  >
                    check_circle
                  </span>
                  <span className="text-xs font-medium" style={{ color: '#16a34a' }}>
                    WhatsApp delivery enabled
                  </span>
                </>
              ) : (
                <span className="text-xs" style={{ color: '#7A8C85' }}>
                  Add a phone number to send via WhatsApp.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Server / network error banner */}
        {state.status === 'error' && (
          <div
            className="ri-field-animate"
            style={fieldAnim(true, reduced, 0)}
          >
            <div
              role="alert"
              aria-live="assertive"
              id="session-error-banner"
              className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-50 px-4 py-3 text-sm mb-2"
              style={{ color: '#b91c1c' }}
            >
              <svg
                className="mt-0.5 h-4 w-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <span>{state.message}</span>
            </div>
          </div>
        )}

        {/* Submit button */}
        <div
          className="ri-field-animate mt-1"
          style={fieldAnim(entered, reduced, d(3))}
        >
          <button
            id="send-triage-link-btn"
            type="submit"
            disabled={!canSubmit}
            aria-busy={isLoading}
            className="relative w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white"
            style={{
              backgroundColor: canSubmit ? (hasPhone ? '#22c55e' : '#4F8FA8') : 'rgba(79,143,168,0.4)',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              boxShadow: canSubmit
                ? hasPhone
                  ? '0 2px 8px rgba(34,197,94,0.25), 4px 5px 16px -4px rgba(34,197,94,0.18)'
                  : '0 2px 8px rgba(79,143,168,0.25), 4px 5px 16px -4px rgba(79,143,168,0.18)'
                : 'none',
              transition: 'background-color 200ms ease, box-shadow 200ms ease, transform 160ms cubic-bezier(0.16,1,0.3,1), opacity 200ms ease',
            }}
            onMouseEnter={(e) => {
              if (canSubmit) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = hasPhone ? '#16a34a' : '#3d7a91';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = hasPhone
                  ? '0 6px 16px rgba(34,197,94,0.35), 4px 6px 20px -4px rgba(34,197,94,0.22)'
                  : '0 6px 16px rgba(79,143,168,0.35), 4px 6px 20px -4px rgba(79,143,168,0.22)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = canSubmit ? (hasPhone ? '#22c55e' : '#4F8FA8') : 'rgba(79,143,168,0.4)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = canSubmit
                ? hasPhone
                  ? '0 2px 8px rgba(34,197,94,0.25), 4px 5px 16px -4px rgba(34,197,94,0.18)'
                  : '0 2px 8px rgba(79,143,168,0.25), 4px 5px 16px -4px rgba(79,143,168,0.18)'
                : 'none';
            }}
            onMouseDown={(e) => {
              if (canSubmit) {
                e.currentTarget.style.transform = 'translateY(0) scale(0.98)';
                e.currentTarget.style.boxShadow = hasPhone
                  ? '0 1px 4px rgba(34,197,94,0.18)'
                  : '0 1px 4px rgba(79,143,168,0.18)';
              }
            }}
            onMouseUp={(e) => {
              if (canSubmit) {
                e.currentTarget.style.transform = 'translateY(-2px) scale(1)';
              }
            }}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner />
                {hasPhone ? 'Generating & opening WhatsApp…' : 'Generating scan link…'}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span
                  className="material-symbols-outlined text-[18px]"
                  style={{ fontVariationSettings: "'FILL' 0" }}
                >
                  {hasPhone ? 'send' : 'link'}
                </span>
                {hasPhone ? 'Generate & Send via WhatsApp' : 'Generate Link Only'}
              </span>
            )}
          </button>
        </div>

      </form>
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

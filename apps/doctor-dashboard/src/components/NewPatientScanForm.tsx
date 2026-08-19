/**
 * src/components/NewPatientScanForm.tsx
 *
 * "New Patient Scan" form — receptionist enters patient details and clicks
 * "Generate Link" or "Generate & Send via WhatsApp". Renders one of four states:
 *
 *   idle     → form inputs + submit button
 *   loading  → spinner, button disabled, inputs locked
 *   success  → form resets, onSuccess fires, link appears in the list below
 *   error    → inline error message, form re-enabled for retry
 *
 * PRIVACY: The phone number only lives in React's controlled-input state
 *     while the user is typing. On successful submission it is cleared from
 *     state. It is never written to localStorage, sessionStorage, or any
 *     analytics call.
 */

import React, { useState, useEffect, useRef, type FormEvent, type ChangeEvent, type CSSProperties } from 'react';
import { useCreateSession } from '../hooks/useCreateSession';

const RI_FORM_KEYFRAMES = `
  @keyframes ri-field-enter {
    0%   { opacity: 0; transform: translateY(18px) scale(0.98); }
    100% { opacity: 1; transform: translateY(0)   scale(1); }
  }
  @keyframes ri-link-enter {
    0%   { opacity: 0; transform: translateY(10px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .ri-field-animate { animation: none !important; opacity: 1 !important; transform: none !important; }
    .ri-link-animate  { animation: none !important; opacity: 1 !important; transform: none !important; }
  }
`;

function useEntrance(): boolean {
  const firedRef = useRef(false);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
  }, []);
  return entered;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false
  );
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
  return { animation: `ri-field-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delayS}s both` };
}

const INPUT_CLASS = 'w-full rounded-xl border bg-white py-3 text-sm transition-all duration-200 focus:outline-none';
const SELECT_CLASS = 'w-full rounded-xl border bg-white py-3 text-sm transition-all duration-200 focus:outline-none appearance-none';

const inputStyle = (hasError?: boolean): CSSProperties => ({
  borderColor: hasError ? 'rgba(239,68,68,0.7)' : 'rgba(79,143,168,0.3)',
  color: '#1a2e35',
  boxShadow: '3px 4px 10px -3px rgba(79,143,168,0.08), 1px 2px 4px -1px rgba(26,46,53,0.04)',
  transition: 'border-color 200ms ease, box-shadow 200ms ease, transform 180ms cubic-bezier(0.16,1,0.3,1)',
});

const onFocusInput = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.currentTarget.style.borderColor = '#4F8FA8';
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(79,143,168,0.15), 4px 5px 14px -3px rgba(79,143,168,0.14)';
  (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
};
const onBlurInput = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.currentTarget.style.borderColor = 'rgba(79,143,168,0.3)';
  e.currentTarget.style.boxShadow = '3px 4px 10px -3px rgba(79,143,168,0.08), 1px 2px 4px -1px rgba(26,46,53,0.04)';
  (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
};
const onHoverInput = (e: React.MouseEvent<HTMLInputElement | HTMLSelectElement>) => {
  if (document.activeElement !== e.currentTarget) {
    e.currentTarget.style.borderColor = 'rgba(79,143,168,0.55)';
    e.currentTarget.style.boxShadow = '4px 5px 14px -3px rgba(79,143,168,0.12), 1px 2px 5px -1px rgba(26,46,53,0.05)';
  }
};
const onLeaveInput = (e: React.MouseEvent<HTMLInputElement | HTMLSelectElement>) => {
  if (document.activeElement !== e.currentTarget) {
    e.currentTarget.style.borderColor = 'rgba(79,143,168,0.3)';
    e.currentTarget.style.boxShadow = '3px 4px 10px -3px rgba(79,143,168,0.08), 1px 2px 4px -1px rgba(26,46,53,0.04)';
  }
};

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi (\u0939\u093f\u0902\u0926\u0940)' },
  { value: 'mr', label: 'Marathi (\u092e\u0930\u093e\u0920\u0940)' },
  { value: 'ta', label: 'Tamil (\u0ba4\u0bae\u0bbf\u0bb4\u0bcd)' },
  { value: 'te', label: 'Telugu (\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41)' },
  { value: 'bn', label: 'Bengali (\u09ac\u09be\u0982\u09b2\u09be)' },
  { value: 'gu', label: 'Gujarati (\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0)' },
  { value: 'kn', label: 'Kannada (\u0c95\u0ca8\u0ccd\u0ca8\u0ca1)' },
  { value: 'ml', label: 'Malayalam (\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02)' },
  { value: 'pa', label: 'Punjabi (\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40)' },
];

interface GeneratedLink {
  id: string;
  patientName: string;
  language: string;
  scanUrl: string;
  createdAt: number;
  copied: boolean;
}

export function NewPatientScanForm({ accessToken, onSuccess }: {
  accessToken: string;
  onSuccess: (data: { patientName: string; patientAge?: number; scanUrl: string; sessionId: string; status: 'WAITING' }) => void;
}) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [language, setLanguage] = useState('en');
  const [nameTouched, setNameTouched] = useState(false);
  const [links, setLinks] = useState<GeneratedLink[]>([]);
  const { state, submit, reset } = useCreateSession();

  const entered = useEntrance();
  const reduced = usePrefersReducedMotion();

  const isLoading = state.status === 'loading';
  const nameError = nameTouched && !name.trim() ? 'Patient name is required.' : null;
  const canSubmit = name.trim().length > 0 && !isLoading;
  const hasPhone = phone.trim().length > 0;

  const d = (i: number) => 0.08 + i * 0.08;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setNameTouched(true);
    if (!canSubmit) return;
    const parsedAge = age.trim() ? parseInt(age.trim(), 10) : undefined;
    const result = await submit(phone.trim() || undefined, name.trim(), parsedAge, accessToken, language);
    if (result.ok && result.data) {
      const scanUrl = result.data.triageLink || result.data.scanUrl;
      setLinks(prev => [{
        id: result.data!.sessionId,
        patientName: name.trim(),
        language,
        scanUrl,
        createdAt: Date.now(),
        copied: false,
      }, ...prev]);
      onSuccess({ patientName: name.trim(), patientAge: parsedAge, scanUrl, sessionId: result.data.sessionId, status: 'WAITING' });
      setName(''); setAge(''); setPhone(''); setLanguage('en'); setNameTouched(false); reset();
    }
  }

  function handleCopy(linkId: string, url: string) {
    void navigator.clipboard.writeText(url).then(() => {
      setLinks(prev => prev.map(l => l.id === linkId ? { ...l, copied: true } : l));
      setTimeout(() => setLinks(prev => prev.map(l => l.id === linkId ? { ...l, copied: false } : l)), 2000);
    });
  }

  return (
    <>
      <style>{RI_FORM_KEYFRAMES}</style>
      <form id="new-patient-scan-form" onSubmit={handleSubmit} noValidate aria-label="New patient scan" className="flex flex-col gap-1">

        {/* Section label */}
        <div className="ri-field-animate" style={fieldAnim(entered, reduced, d(0))}>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] mb-4" style={{ color: '#9E6B40' }}>
            Patient Information
          </span>
        </div>

        {/* Patient name */}
        <div className="ri-field-animate flex flex-col gap-1.5 mb-3" style={fieldAnim(entered, reduced, d(1))}>
          <label htmlFor="patient-name-input" className="text-sm font-semibold" style={{ color: '#1a2e35' }}>Patient name</label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[17px] pointer-events-none" style={{ color: '#7A8C85', fontVariationSettings: "'FILL' 0" }}>person</span>
            <input
              id="patient-name-input" type="text" autoComplete="off" placeholder="Full name"
              value={name} onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              onBlur={() => setNameTouched(true)} disabled={isLoading}
              className={`${INPUT_CLASS} pl-10 pr-4`} style={inputStyle(!!nameError)}
              onFocus={onFocusInput} onMouseEnter={onHoverInput} onMouseLeave={onLeaveInput}
            />
          </div>
          {nameError && <p className="text-xs" style={{ color: '#b91c1c' }}>{nameError}</p>}
        </div>

        {/* Age + Phone row */}
        <div className="ri-field-animate flex flex-col sm:flex-row gap-3 mb-3" style={fieldAnim(entered, reduced, d(2))}>
          {/* Age */}
          <div className="flex flex-col gap-1.5 sm:w-[140px] shrink-0">
            <label htmlFor="patient-age-input" className="text-sm font-semibold" style={{ color: '#1a2e35' }}>
              Age <span className="text-xs font-normal ml-1" style={{ color: '#7A8C85' }}>(optional)</span>
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[17px] pointer-events-none" style={{ color: '#7A8C85', fontVariationSettings: "'FILL' 0" }}>calendar_month</span>
              <input
                id="patient-age-input" type="number" min={0} max={130} placeholder="Years"
                value={age} onChange={(e: ChangeEvent<HTMLInputElement>) => setAge(e.target.value)}
                disabled={isLoading} className={`${INPUT_CLASS} pl-10 pr-4`} style={inputStyle()}
                onFocus={onFocusInput} onBlur={onBlurInput} onMouseEnter={onHoverInput} onMouseLeave={onLeaveInput}
              />
            </div>
          </div>
          {/* Phone */}
          <div className="flex flex-col gap-1.5 flex-1">
            <label htmlFor="patient-phone-input" className="text-sm font-semibold" style={{ color: '#1a2e35' }}>
              Phone number <span className="text-xs font-normal ml-1" style={{ color: '#7A8C85' }}>(optional)</span>
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[17px] pointer-events-none" style={{ color: '#7A8C85', fontVariationSettings: "'FILL' 0" }}>phone</span>
              <input
                id="patient-phone-input" type="tel" autoComplete="tel" placeholder="+91 98765 43210"
                value={phone} onChange={(e: ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
                disabled={isLoading} className={`${INPUT_CLASS} pl-10 pr-4`} style={inputStyle()}
                onFocus={onFocusInput} onBlur={onBlurInput} onMouseEnter={onHoverInput} onMouseLeave={onLeaveInput}
              />
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 min-h-[18px]">
              {hasPhone ? (
                <>
                  <span className="material-symbols-outlined text-[14px]" style={{ color: '#22c55e', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <span className="text-xs font-medium" style={{ color: '#16a34a' }}>WhatsApp delivery enabled</span>
                </>
              ) : (
                <span className="text-xs" style={{ color: '#7A8C85' }}>Add a phone number to send via WhatsApp.</span>
              )}
            </div>
          </div>
        </div>

        {/* Preferred Language */}
        <div className="ri-field-animate flex flex-col gap-1.5 mb-3" style={fieldAnim(entered, reduced, d(3))}>
          <label htmlFor="patient-language-select" className="text-sm font-semibold" style={{ color: '#1a2e35' }}>
            Preferred language <span className="text-xs font-normal ml-1" style={{ color: '#7A8C85' }}>(for WhatsApp summary)</span>
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[17px] pointer-events-none" style={{ color: '#7A8C85', fontVariationSettings: "'FILL' 0" }}>language</span>
            <span className="material-symbols-outlined absolute right-3.5 top-1/2 -translate-y-1/2 text-[17px] pointer-events-none" style={{ color: '#7A8C85', fontVariationSettings: "'FILL' 0" }}>expand_more</span>
            <select
              id="patient-language-select" value={language}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setLanguage(e.target.value)}
              disabled={isLoading} className={`${SELECT_CLASS} pl-10 pr-10`} style={inputStyle()}
              onFocus={onFocusInput} onBlur={onBlurInput} onMouseEnter={onHoverInput} onMouseLeave={onLeaveInput}
            >
              {LANGUAGE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        </div>

        {/* Error banner */}
        {state.status === 'error' && (
          <div className="ri-field-animate" style={fieldAnim(true, reduced, 0)}>
            <div role="alert" aria-live="assertive" id="session-error-banner"
              className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-50 px-4 py-3 text-sm mb-2"
              style={{ color: '#b91c1c' }}>
              <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <span>{state.message}</span>
            </div>
          </div>
        )}

        {/* Submit button */}
        <div className="ri-field-animate mt-1" style={fieldAnim(entered, reduced, d(4))}>
          <button
            id="send-triage-link-btn" type="submit" disabled={!canSubmit} aria-busy={isLoading}
            className="relative w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white"
            style={{
              backgroundColor: canSubmit ? (hasPhone ? '#22c55e' : '#4F8FA8') : 'rgba(79,143,168,0.4)',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              boxShadow: canSubmit ? (hasPhone ? '0 2px 8px rgba(34,197,94,0.25), 4px 5px 16px -4px rgba(34,197,94,0.18)' : '0 2px 8px rgba(79,143,168,0.25), 4px 5px 16px -4px rgba(79,143,168,0.18)') : 'none',
              transition: 'background-color 200ms ease, box-shadow 200ms ease, transform 160ms cubic-bezier(0.16,1,0.3,1)',
            }}
            onMouseEnter={(e) => {
              if (canSubmit) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = hasPhone ? '#16a34a' : '#3d7a91';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = hasPhone ? '0 6px 16px rgba(34,197,94,0.35)' : '0 6px 16px rgba(79,143,168,0.35)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = canSubmit ? (hasPhone ? '#22c55e' : '#4F8FA8') : 'rgba(79,143,168,0.4)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = canSubmit ? (hasPhone ? '0 2px 8px rgba(34,197,94,0.25)' : '0 2px 8px rgba(79,143,168,0.25)') : 'none';
            }}
            onMouseDown={(e) => { if (canSubmit) { e.currentTarget.style.transform = 'translateY(0) scale(0.98)'; } }}
            onMouseUp={(e) => { if (canSubmit) { e.currentTarget.style.transform = 'translateY(-2px) scale(1)'; } }}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner />
                {hasPhone ? 'Generating & opening WhatsApp\u2026' : 'Generating scan link\u2026'}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 0" }}>
                  {hasPhone ? 'send' : 'link'}
                </span>
                {hasPhone ? 'Generate & Send via WhatsApp' : 'Generate Link Only'}
              </span>
            )}
          </button>
        </div>

      </form>

      {/* Generated Links List */}
      {links.length > 0 && (
        <div className="mt-5 flex flex-col gap-2">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: '#9E6B40' }}>
            Generated Links
          </span>
          {links.map(link => {
            const langLabel = LANGUAGE_OPTIONS.find(o => o.value === link.language)?.label ?? link.language;
            return (
              <div
                key={link.id}
                className="ri-link-animate rounded-xl border px-4 py-3 flex flex-col gap-2"
                style={{
                  animation: 'ri-link-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0s both',
                  borderColor: 'rgba(79,143,168,0.2)',
                  backgroundColor: 'rgba(79,143,168,0.04)',
                }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="material-symbols-outlined text-[15px]" style={{ color: '#4F8FA8', fontVariationSettings: "'FILL' 1" }}>person</span>
                  <span className="text-sm font-semibold" style={{ color: '#1a2e35' }}>{link.patientName}</span>
                  <span className="text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ backgroundColor: 'rgba(79,143,168,0.12)', color: '#4F8FA8' }}>{langLabel}</span>
                  <span className="text-xs ml-auto" style={{ color: '#7A8C85' }}>
                    {new Date(link.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    id={`copy-link-btn-${link.id}`}
                    onClick={() => handleCopy(link.id, link.scanUrl)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150"
                    style={{
                      backgroundColor: link.copied ? 'rgba(34,197,94,0.12)' : 'rgba(79,143,168,0.1)',
                      color: link.copied ? '#16a34a' : '#4F8FA8',
                      border: `1px solid ${link.copied ? 'rgba(34,197,94,0.3)' : 'rgba(79,143,168,0.2)'}`,
                    }}
                  >
                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 0" }}>
                      {link.copied ? 'check' : 'content_copy'}
                    </span>
                    {link.copied ? 'Copied!' : 'Copy Link'}
                  </button>
                  <a
                    id={`open-link-btn-${link.id}`}
                    href={link.scanUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150"
                    style={{ backgroundColor: 'rgba(26,46,53,0.06)', color: '#1a2e35', border: '1px solid rgba(26,46,53,0.1)', textDecoration: 'none' }}
                  >
                    <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 0" }}>open_in_new</span>
                    Open
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/**
 * src/components/NewPatientScanForm.tsx
 *
 * "New Patient Scan" form — doctor enters a patient phone number and clicks
 * "Send Triage Link". Renders one of four states:
 *
 *   idle     → phone input + submit button
 *   loading  → spinner, button disabled, input locked
 *   success  → confirmation panel with session details
 *   error    → inline error message, form re-enabled for retry
 *
 * ⚠️  PRIVACY: The phone number only lives in React's controlled-input state
 *     while the user is typing. On successful submission it is cleared from
 *     state. It is never written to localStorage, sessionStorage, or any
 *     analytics call.
 */

import { useState, type FormEvent, type ChangeEvent } from 'react';
import { useCreateSession } from '../hooks/useCreateSession';

// ─── Component ─────────────────────────────────────────────────────────────────

export function NewPatientScanForm({ accessToken, onSuccess }: { accessToken: string, onSuccess: (data: { patientName: string, patientAge?: number, scanUrl: string, sessionId: string, status: 'WAITING' }) => void }) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const { state, submit, reset } = useCreateSession();

  const isLoading = state.status === 'loading';
  const nameError = nameTouched && !name.trim() ? 'Patient name is required.' : null;
  const canSubmit = name.trim().length > 0 && !isLoading;

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


  // ── Success state ────────────────────────────────────────────────────────────


  // ── Idle / loading / error state ─────────────────────────────────────────────
  return (
    <form
      id="new-patient-scan-form"
      onSubmit={handleSubmit}
      noValidate
      aria-label="New patient scan"
      className="flex flex-col gap-4"
    >
      {/* Patient name */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="patient-name-input"
          className="text-sm font-medium"
          style={{ color: '#1a2e35' }}
        >
          Patient name
        </label>
        <input
          id="patient-name-input"
          type="text"
          autoComplete="off"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setNameTouched(true)}
          disabled={isLoading}
          className="w-full rounded-xl border bg-white px-4 py-3 text-sm transition-all duration-200 focus:outline-none"
          style={{ borderColor: nameError ? 'rgba(239,68,68,0.7)' : 'rgba(79,143,168,0.3)', color: '#1a2e35' }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#4F8FA8';
            e.currentTarget.style.boxShadow = '0 0 0 2px rgba(79,143,168,0.25)';
          }}
        />
        {nameError && (
          <p className="text-xs" style={{ color: '#b91c1c' }}>{nameError}</p>
        )}
      </div>

      {/* Age */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="patient-age-input"
          className="text-sm font-medium"
          style={{ color: '#1a2e35' }}
        >
          Age
        </label>
        <input
          id="patient-age-input"
          type="number"
          min={0}
          max={130}
          placeholder="Years"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          disabled={isLoading}
          className="w-full rounded-xl border bg-white px-4 py-3 text-sm transition-all duration-200 focus:outline-none"
          style={{ borderColor: 'rgba(79,143,168,0.3)', color: '#1a2e35' }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#4F8FA8';
            e.currentTarget.style.boxShadow = '0 0 0 2px rgba(79,143,168,0.25)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(79,143,168,0.3)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
      </div>

      {/* Phone Number */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="patient-phone-input"
          className="text-sm font-medium"
          style={{ color: '#1a2e35' }}
        >
          Phone number
        </label>
        <div className="flex gap-2">
          <input
            id="patient-phone-input"
            type="tel"
            autoComplete="tel"
            placeholder="+1 555-555-5555"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={isLoading}
            className="w-full rounded-xl border bg-white px-4 py-3 text-sm transition-all duration-200 focus:outline-none"
            style={{ borderColor: 'rgba(79,143,168,0.3)', color: '#1a2e35' }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#4F8FA8';
              e.currentTarget.style.boxShadow = '0 0 0 2px rgba(79,143,168,0.25)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(79,143,168,0.3)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>
      </div>

      {/* Server / network error banner */}
      {state.status === 'error' && (
        <div
          role="alert"
          aria-live="assertive"
          id="session-error-banner"
          className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-50 px-4 py-3 text-sm"
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
      )}

      {/* Submit button */}
      <button
        id="send-triage-link-btn"
        type="submit"
        disabled={!canSubmit}
        aria-busy={isLoading}
        className="relative w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all duration-200 active:scale-[0.98]"
        style={{
          backgroundColor: canSubmit ? (phone.trim() ? '#22c55e' : '#4F8FA8') : 'rgba(79,143,168,0.4)',
          cursor: canSubmit ? 'pointer' : 'not-allowed',
        }}
        onMouseEnter={(e) => {
          if (canSubmit) (e.currentTarget as HTMLButtonElement).style.backgroundColor = phone.trim() ? '#16a34a' : '#3d7a91';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = canSubmit ? (phone.trim() ? '#22c55e' : '#4F8FA8') : 'rgba(79,143,168,0.4)';
        }}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner />
            {phone.trim() ? 'Generating & opening WhatsApp…' : 'Generating scan link…'}
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
            </svg>
            {phone.trim() ? 'Generate & Send via WhatsApp' : 'Generate Link Only'}
          </span>
        )}
      </button>

    </form>
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


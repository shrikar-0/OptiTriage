/**
 * src/components/shared/SendTriageLinkModal.tsx
 *
 * Modal that wraps the existing NewPatientScanForm, triggered from the
 * sidebar "Send Triage Link" button.
 *
 * Reuses:
 *   - NewPatientScanForm  (idle / loading / success / error states)
 *   - useCreateSession    (hook that calls POST /api/sessions)
 *   - sessionsApi         (API client)
 *
 * No new colors are introduced — all values are taken from the existing
 * sidebar palette (#4F8FA8, white, white/20, etc.) and the card style
 * already used in the vitals panels.
 */

import { useEffect, useRef } from 'react';
import { NewPatientScanForm } from '../NewPatientScanForm';

interface SendTriageLinkModalProps {
  open: boolean;
  onClose: () => void;
  accessToken: string;
}

export function SendTriageLinkModal({ open, onClose, accessToken }: SendTriageLinkModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Focus first focusable element when modal opens
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => {
        const firstInput = overlayRef.current?.querySelector<HTMLElement>(
          'input, button, [tabindex]:not([tabindex="-1"])',
        );
        firstInput?.focus();
      }, 50);
      return () => clearTimeout(id);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Send triage link"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl border shadow-2xl"
        style={{ backgroundColor: '#1a2e35', borderColor: 'rgba(255,255,255,0.10)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.12)' }}
        >
          <div className="flex items-center gap-2.5">
            <svg
              className="h-5 w-5"
              style={{ color: '#4F8FA8' }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
              />
            </svg>
            <h2 className="text-sm font-semibold text-white tracking-tight">
              Send Triage Link
            </h2>
          </div>

          <button
            id="send-triage-link-modal-close"
            onClick={onClose}
            aria-label="Close send triage link modal"
            className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
            style={{ color: 'rgba(255,255,255,0.5)' }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.1)')
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent')
            }
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          <NewPatientScanForm accessToken={accessToken} onSuccess={onClose} />
        </div>
      </div>
    </div>
  );
}

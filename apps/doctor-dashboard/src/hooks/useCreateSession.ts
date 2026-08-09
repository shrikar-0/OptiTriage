/**
 * src/hooks/useCreateSession.ts
 *
 * React hook that wraps the session-creation API call with loading,
 * success, and error state management.
 *
 * Keeps all async state in one place so the form component stays declarative.
 */

import { useState, useCallback } from 'react';
import { createSession, type CreateSessionSuccess } from '../api/sessionsApi';

export type SessionFormState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: CreateSessionSuccess }
  | { status: 'error'; message: string };

export interface UseCreateSessionReturn {
  state: SessionFormState;
  /** Submit a session-creation request. */
  submit: (phone: string | undefined, name: string, age: number | undefined, doctorToken: string) => Promise<{ok: boolean, data?: CreateSessionSuccess}>;
  /** Reset back to idle so the form can be reused. */
  reset: () => void;
}

export function useCreateSession(): UseCreateSessionReturn {
  const [state, setState] = useState<SessionFormState>({ status: 'idle' });

  const submit = useCallback(async (phone: string | undefined, name: string, age: number | undefined, doctorToken: string) => {
    setState({ status: 'loading' });

    const result = await createSession(phone, name, age, doctorToken);

    if (result.ok) {
      setState({ status: 'success', data: result.data });
      // Notify the triage queue
      window.dispatchEvent(new CustomEvent('optitriage:session_created', { detail: result.data.sessionId }));
      return { ok: true, data: result.data };
    } else {
      setState({ status: 'error', message: result.message });
      return { ok: false };
    }
  }, []);

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  return { state, submit, reset };
}

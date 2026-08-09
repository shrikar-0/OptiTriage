/**
 * src/api/sessionsApi.ts
 *
 * Typed client for the OptiTriage session-creation API endpoint.
 *
 * ⚠️  PRIVACY: The patient phone number is sent to the API server over
 *     HTTPS (in production) in a POST request body. It is never stored
 *     in localStorage, sessionStorage, component state beyond the form
 *     input, or any analytics/logging call in this client.
 *
 * The doctor token required for the API call is passed in at call time
 * from the caller — this module does not read or store credentials itself.
 */

// In local dev, leave VITE_API_BASE_URL unset — the Vite proxy forwards /api/*
// to localhost:3001 automatically. In production, set it to the deployed API origin.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export interface CreateSessionRequest {
  /** Patient phone — forwarded to the backend WhatsApp gateway. Optional. */
  patientPhone?: string;
  patientName: string;
  patientAge?: number;
}

export interface CreateSessionSuccess {
  sessionId: string;
  doctorToken: string;
  patientToken: string;
  triageLink: string;
  scanUrl: string;
  expiresAt: number; // Unix ms
  smsError?: string; // present if SMS failed but session was created
}

export interface CreateSessionError {
  error: string;
  details?: Record<string, string[]>;
}

export type CreateSessionResult =
  | { ok: true; data: CreateSessionSuccess }
  | { ok: false; status: number; message: string };

/**
 * Calls POST /api/sessions.
 *
 * @param phone      Patient phone number — passed through to API, not stored.
 * @param name       Patient name.
 * @param age        Patient age.
 * @param doctorToken  Short-lived doctor JWT to authorise the request.
 */
export async function createSession(
  phone: string | undefined,
  name: string,
  age: number | undefined,
  doctorToken: string,
): Promise<CreateSessionResult> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${doctorToken}`,
      },
      body: JSON.stringify({ patientPhone: phone || undefined, patientName: name, patientAge: age } satisfies CreateSessionRequest),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      message: 'Could not reach the OptiTriage server. Check your network connection.',
    };
  }

  if (response.ok || response.status === 207) {
    const data = (await response.json()) as CreateSessionSuccess;
    return { ok: true, data };
  }

  // Parse server error body
  let message = `Unexpected server error (HTTP ${response.status}).`;
  try {
    const errBody = (await response.json()) as CreateSessionError;
    if (errBody.error) message = errBody.error;
    // Flatten Zod field errors if present
    if (errBody.details) {
      const fieldErrors = Object.values(errBody.details).flat().join(' ');
      if (fieldErrors) message = fieldErrors;
    }
  } catch {
    /* response body was not JSON — use the default message */
  }

  return { ok: false, status: response.status, message };
}

/**
 * src/lib/jwtUtils.ts
 *
 * JWT sign / verify helpers scoped to OptiTriage session tokens.
 *
 * Token payload carries only opaque identifiers — no PII (phone number,
 * patient name, or any directly identifying field) is ever encoded in the JWT.
 *
 * Expiry is configurable via JWT_SESSION_EXPIRY_SECONDS (default 1800s = 30 min).
 */

import jwt from 'jsonwebtoken';
import { config } from '../config';

// ─── Token payload types ───────────────────────────────────────────────────────

/** Claims we sign into every session token. Contains no PII. */
export interface SessionTokenPayload {
  /** Opaque UUID for the triage session. */
  sessionId: string;
  /** Opaque UUID for the doctor who created the session. */
  doctorId: string;
  /**
   * Role scopes what the token bearer is allowed to do on the socket.
   * 'patient' → may emit vitals; 'doctor' → may receive vitals:update.
   */
  role: 'patient' | 'doctor';
}

/** Verified payload with standard JWT registered claims. */
export type VerifiedSessionToken = SessionTokenPayload & {
  iat: number;
  exp: number;
};

// ─── Sign ──────────────────────────────────────────────────────────────────────

/**
 * Signs a short-lived session token.
 * No PII is included in the payload — only UUIDs and a role discriminator.
 */
export function signSessionToken(payload: SessionTokenPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expirySeconds,
    algorithm: 'HS256',
  });
}

// ─── Verify ───────────────────────────────────────────────────────────────────

/**
 * Verifies a session token and returns the decoded payload.
 * Throws `JsonWebTokenError` or `TokenExpiredError` on failure — callers must
 * handle these.
 */
export function verifySessionToken(token: string): VerifiedSessionToken {
  return jwt.verify(token, config.jwt.secret, {
    algorithms: ['HS256'],
  }) as VerifiedSessionToken;
}

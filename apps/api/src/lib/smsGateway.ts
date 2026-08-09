/**
 * src/lib/smsGateway.ts
 *
 * SMS delivery abstraction for Twilio magic-link messages.
 *
 * Stub mode (local dev / CI):
 *   When TWILIO_ACCOUNT_SID is not set, the module logs the scan link to the
 *   console.  The phone number is NEVER logged — only the link.
 *
 * Production mode:
 *   When all three Twilio env vars are present, a real SMS is sent via the
 *   Twilio REST API.  Swap in credentials in .env — no code changes required.
 *
 * ⚠️  PRIVACY: This function receives the patient's phone number (`to`).
 *     It is passed directly to Twilio (prod) or discarded after the call (stub).
 *     It is never written to logs, metrics, or the response body.
 */

import { config } from '../config';

/**
 * Sends (or stubs) the patient scan link via SMS.
 *
 * @param to   Patient phone number in E.164 format — NEVER logged.
 * @param link The scan URL containing the session JWT token.
 */
export async function sendScanLink(to: string, link: string): Promise<void> {
  const { accountSid, authToken, fromNumber } = config.twilio;
  const isStub = !accountSid || !authToken || !fromNumber;

  if (isStub) {
    // ── STUB MODE ───────────────────────────────────────────────────────────
    // Phone number is intentionally omitted from this log line.
    console.log(
      `[SMS-STUB] Scan link (would be sent via Twilio in production):\n  ${link}\n` +
        `  Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER in .env to enable live SMS.`,
    );
    return;
  }

  // ── PRODUCTION MODE ────────────────────────────────────────────────────────
  // Dynamic import keeps the Twilio SDK out of the dependency graph entirely
  // unless production credentials are actually present.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const twilio = require('twilio') as (sid: string, token: string) => TwilioClient;
    const client = twilio(accountSid, authToken);
    await client.messages.create({
      body: `Your OptiTriage scan link (expires in 30 min): ${link}`,
      from: fromNumber,
      to, // phone number passed through — never logged
    });
    console.log(`[SMS] Scan link dispatched via Twilio.`);
  } catch (err) {
    // Re-throw so the session endpoint can return 502 rather than silently failing.
    throw new Error(`[SMS] Twilio delivery failed: ${(err as Error).message}`);
  }
}

// ─── Minimal Twilio client type (avoids a hard dev dependency) ────────────────

interface TwilioClient {
  messages: {
    create(params: { body: string; from: string; to: string }): Promise<unknown>;
  };
}

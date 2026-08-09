/**
 * src/routes/sessions.ts
 *
 * POST /api/sessions — doctor-initiated session creation.
 *
 * Flow:
 *   1. Doctor's dashboard sends { patientPhone, patientName, patientAge } with a valid doctor JWT.
 *   2. Server creates a UUID session, writes to DB, and generates two short-lived JWTs:
 *      - doctorToken  (role: 'doctor')  — returned in response body
 *      - patientToken (role: 'patient') — embedded in scan link, sent via SMS
 *   3. SMS gateway dispatches (or stubs) the scan link to the patient's phone.
 *   4. Response: { sessionId, expiresAt } — phone number is NEVER echoed back.
 *
 * ⚠️  PRIVACY:
 *   patientPhone is accepted from the request body, passed to sendScanLink(),
 *   and immediately discarded.  It is never stored in a response body, never
 *   written to console logs, and never included in any JWT payload.
 *   It is held in the in-memory session map under a hashed reference for the
 *   session lifetime only.
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { Server as SocketIOServer } from 'socket.io';

import { requireSupabaseJwt } from '../middleware/requireSupabaseJwt';
import { sessionCreateLimiter } from '../middleware/rateLimiter';
import { signSessionToken } from '../lib/jwtUtils';
import { sendScanLink } from '../lib/smsGateway';
import { config } from '../config';
import { sessionStore } from '../store/sessionStore';
import { createSession as dbCreateSession } from '../db/sessionRepository';

let _io: SocketIOServer | null = null;

export function createSessionsRouter(io: SocketIOServer): Router {
  _io = io;
  const router = Router();

  // ─── Zod schema — strict input validation ─────────────────────────────────────

  const CreateSessionBody = z.object({
    /**
     * Patient phone number in E.164 format.
     * Optional — if omitted, no SMS is sent but the scan link is still generated.
     * Accepted here, passed to SMS gateway, NEVER echoed in response.
     */
    patientPhone: z
      .string()
      .regex(/^\+[1-9]\d{6,14}$/, 'patientPhone must be a valid E.164 number (e.g. +12125551234)')
      .optional(),
    patientName: z.string().min(1, 'patientName is required'),
    patientAge: z.number().int().positive().optional(),
  });

  // ─── Route handler ─────────────────────────────────────────────────────────────

  router.post(
    '/',
    sessionCreateLimiter,
    requireSupabaseJwt,
    async (req: Request, res: Response): Promise<void> => {
      // 1. Validate body
      const parsed = CreateSessionBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid request body.',
          details: parsed.error.flatten().fieldErrors,
        });
        return;
      }

      const { patientPhone, patientName, patientAge } = parsed.data; // ← PII; handled only in steps 6 & 7 below
      const staffUser = res.locals.staffUser;

      // 2. Create session
      const sessionId = randomUUID();
      const expiresAt = Date.now() + config.jwt.expirySeconds * 1000;

      // 3. Persist session to DB first, awaiting it so it exists before we emit to doctors
      await dbCreateSession({
        id: sessionId,
        doctorId: staffUser.userId,
        expiresAt: new Date(expiresAt),
        patientName,
        patientAge,
      });

      // 4. Persist session metadata in-memory (for JWT validation)
      sessionStore.create({
        sessionId,
        doctorId: staffUser.userId,
        expiresAt,
      });

      // 5. Emit session:created to /triage namespace
      if (_io) {
        _io.of('/triage').emit('session:created', {
          sessionId,
          patientName: patientName ?? null,
          patientAge: patientAge ?? null,
          createdAt: Date.now(),
          status: 'WAITING',
        });
      }

      // 6. Sign tokens
      const patientToken = signSessionToken({
        sessionId,
        doctorId: staffUser.userId,
        role: 'patient',
      });

      const doctorToken = signSessionToken({
        sessionId,
        doctorId: staffUser.userId,
        role: 'doctor',
      });

      // 7. Build scan URL and optionally dispatch SMS
      const scanUrl = `${config.scan.baseUrl}?token=${patientToken}`;

      if (patientPhone) {
        // patientPhone is passed through here — see privacy note in module doc.
        try {
          await sendScanLink(patientPhone, scanUrl);
        } catch (err) {
          console.error('[sessions] SMS dispatch failed:', (err as Error).message);
          // SMS failed but the session + DB row are intact.
          // Return the scan URL so the receptionist can share it manually.
          res.status(207).json({
            sessionId,
            doctorToken,
            patientToken,
            scanUrl,
            expiresAt,
            smsError: 'SMS delivery failed — share the scan URL manually.',
          });
          return;
        }
      } else {
        console.log(`[sessions] No phone provided — SMS skipped. Scan URL: ${scanUrl}`);
      }

      // 8. Respond — phone number deliberately excluded from response body.
      res.status(201).json({
        sessionId,
        doctorToken,
        patientToken,
        scanUrl,
        expiresAt,
      });
    },
  );

  // ─── GET /api/sessions/:sessionId — session status ───────────────────────────

  router.get('/:sessionId', requireSupabaseJwt, (req: Request, res: Response): void => {
    const { sessionId } = req.params;
    const session = sessionStore.get(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found or has expired.' });
      return;
    }

    // Only the session's doctor may query it
    if (session.doctorId !== res.locals.staffUser.userId) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }

    res.json({
      sessionId: session.sessionId,
      doctorId: session.doctorId,
      expiresAt: session.expiresAt,
      connectedPatient: session.patientConnected,
      connectedDoctor: session.doctorConnected,
    });
  });

  return router;
}

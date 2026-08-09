/**
 * src/routes/vitals.ts
 *
 * POST /api/sessions/:sessionId/vitals — HTTP fallback for vital sign submission.
 *
 * The primary data path is Socket.io (`/triage` namespace). This REST endpoint
 * exists as a graceful degradation path for environments where WebSockets are
 * blocked (e.g., some hospital network proxies).
 *
 * ─── SECURITY CONSTRAINT ────────────────────────────────────────────────────
 * This endpoint explicitly REJECTS any payload that:
 *   - Contains binary/buffer fields
 *   - Contains strings > 512 chars (base64 heuristic)
 *   - Contains data URIs ("data:...")
 *   - Contains nested objects or arrays
 *
 * Only the numeric TriagePayload shape is accepted.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireJwt } from '../middleware/auth';
import { guardNumericPayload } from '../lib/payloadGuard';
import { sessionStore } from '../store/sessionStore';
import { getEwsRiskBand } from '@optitriage/shared';
import { computeNews2Score } from '../lib/news2';
import { persistScan } from '../db/scanRepository';
import type { Server as SocketIOServer } from 'socket.io';

// The Socket.io server is injected at registration time so the route can
// broadcast updates to connected doctor clients.
let _io: SocketIOServer | null = null;

export function createVitalsRouter(io: SocketIOServer): Router {
  _io = io;
  const router = Router({ mergeParams: true });

  // ─── Zod schema — numeric-only TriagePayload ──────────────────────────────

  const VitalsBody = z.object({
    sessionId: z.string().uuid(),
    timestamp: z.number().int().positive(),
    bpm: z.number().min(30).max(250),
    hrv: z.number().min(0).max(500),
    respiratoryRate: z.number().min(5).max(60),
    motionAsymmetryFlag: z.boolean(),
    ewsScore: z.number().int().min(0).max(20),
    totalCycles: z.number().int().min(1).max(5).optional(),
    discardedCycles: z.number().int().min(0).max(4).optional(),
  });

  // ─── POST /api/sessions/:sessionId/vitals ─────────────────────────────────

  router.post('/:sessionId/vitals', requireJwt, (req: Request, res: Response): void => {
    const jwtPayload = res.locals.jwtPayload;

    // Only patients may push vitals
    if (jwtPayload.role !== 'patient') {
      res.status(403).json({ error: 'Only patient-scoped tokens may submit vitals.' });
      return;
    }

    // Session must match the JWT claim
    const { sessionId } = req.params;
    if (jwtPayload.sessionId !== sessionId) {
      res.status(403).json({ error: 'Token session mismatch.' });
      return;
    }

    const session = sessionStore.get(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found or expired.' });
      return;
    }

    // ── Payload guard: reject non-numeric / binary data ───────────────────
    const rejection = guardNumericPayload(req.body);
    if (rejection) {
      res.status(400).json({
        error: 'Payload contains non-numeric data. Only numeric vital signs are accepted.',
        detail: rejection,
      });
      return;
    }

    // ── Zod validation ────────────────────────────────────────────────────
    const parsed = VitalsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid vitals payload.',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const vitals = parsed.data;

    // ── Compute NEWS2 score from available vitals ─────────────────────────
    const news2 = computeNews2Score({
      respiratoryRate: vitals.respiratoryRate,
      heartRate: vitals.bpm,
    });

    // ── Persist scan to database (no-op if DB unavailable) ────────────────
    void persistScan(sessionId, vitals, news2);

    // ── Broadcast to doctor room via Socket.io ────────────────────────────
    if (_io) {
      _io.to(`session:${sessionId}`).emit('vitals:update', {
        ...vitals,
        ewsRiskBand: getEwsRiskBand(vitals.ewsScore),
        news2: {
          totalScore: news2.totalScore,
          riskBand: news2.riskBand,
          singleParameterAlert: news2.singleParameterAlert,
          unobservedParameterCount: news2.unobservedParameterCount,
        },
      });
    }

    res.status(204).send();
  });

  return router;
}

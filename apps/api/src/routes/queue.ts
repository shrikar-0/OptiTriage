/**
 * src/routes/queue.ts
 *
 * GET /api/queue — live triage queue for the doctor dashboard.
 *
 * Returns all active sessions belonging to the authenticated doctor,
 * sorted by NEWS2 risk severity (red → yellow → green) then by most
 * recent scan timestamp within each band.
 *
 * The dashboard polls this endpoint on a configurable interval. Real-time
 * vitals updates for a specific open session use the Socket.io `vitals:update`
 * broadcast instead — this endpoint provides the sorted historical queue view.
 *
 * Protected by:
 *   - requireJwt (doctor-scoped token required)
 *   - generalLimiter (applied globally in index.ts)
 */

import { Router, type Request, type Response } from 'express';
import { requireSupabaseJwt } from '../middleware/requireSupabaseJwt';
import { fetchTriageQueue } from '../db/scanRepository';

export const queueRouter: Router = Router();

// ─── GET /api/queue ───────────────────────────────────────────────────────────

queueRouter.get('/', requireSupabaseJwt, async (req: Request, res: Response): Promise<void> => {
  const staffUser = res.locals.staffUser;

  // Only DOCTOR-role staff may access the queue
  if (staffUser.role !== 'DOCTOR') {
    res.status(403).json({ error: 'Only doctor accounts may access the triage queue.' });
    return;
  }

  // Optional: limit query param (default 50, max 100)
  const rawLimit = req.query['limit'];
  const limit = typeof rawLimit === 'string' ? Math.min(parseInt(rawLimit, 10) || 50, 100) : 50;

  try {
    const sessions = await fetchTriageQueue(staffUser.userId, limit);

    res.json({
      /**
       * Queue sorted red → yellow → green, then newest-first within band.
       * Empty array when DB is unavailable (graceful degradation).
       */
      sessions,
      count: sessions.length,
      /**
       * Indicates whether the result comes from the live database or the
       * in-memory fallback (which cannot populate the historical queue).
       */
      source: sessions.length === 0 && !process.env['DATABASE_URL']
        ? 'in-memory-fallback'
        : 'database',
      generatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[queue] Unexpected error:', (err as Error).message);
    res.status(500).json({ error: 'Failed to fetch triage queue.' });
  }
});

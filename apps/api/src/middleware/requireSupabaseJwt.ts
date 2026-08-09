/**
 * src/middleware/requireSupabaseJwt.ts
 *
 * Express middleware for routes protected by Supabase Auth (staff/doctor routes).
 *
 * Flow:
 *   1. Reads Bearer token from Authorization header.
 *   2. Verifies it with supabaseAdmin.auth.getUser() — validates signature,
 *      expiry, and issuer without touching the DB directly.
 *   3. Looks up the matching Staff row by supabaseUserId.
 *   4. Attaches { userId, role } to res.locals.staffUser.
 *
 * Returns:
 *   - 401 if the token is missing, malformed, or invalid.
 *   - 403 if the Supabase user has no Staff row (account not fully registered).
 *   - 503 if the database is unavailable.
 *
 * This middleware is ONLY used on staff/doctor HTTP routes.
 * The patient scan JWT path (requireJwt + verifySessionToken) is completely
 * separate and untouched.
 */

import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getPrismaClient } from '../db/prismaClient';

/** Shape added to res.locals by requireSupabaseJwt. */
declare global {
  namespace Express {
    interface Locals {
      staffUser: { userId: string; role: string };
    }
  }
}

export async function requireSupabaseJwt(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header.' });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  // Verify with Supabase — this validates the JWT signature and expiry.
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  const db = getPrismaClient();
  if (!db) {
    res.status(503).json({ error: 'Database unavailable — cannot verify staff account.' });
    return;
  }

  let staff: { id: string; role: string } | null;
  try {
    staff = await db.staff.findUnique({ where: { supabaseUserId: user.id } });
  } catch (err) {
    console.error('[requireSupabaseJwt] Staff lookup failed:', (err as Error).message);
    res.status(503).json({
      error: 'Database unavailable — cannot verify staff account.',
      detail: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined,
    });
    return;
  }

  if (!staff) {
    res
      .status(403)
      .json({ error: 'No staff account found for this user. Please complete registration.' });
    return;
  }

  res.locals.staffUser = { userId: staff.id, role: staff.role };
  next();
}

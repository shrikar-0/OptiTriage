/**
 * src/routes/staff.ts
 *
 * POST /api/staff  — register a staff member record on first sign-up.
 * GET  /api/staff/me — return { role, name } for the authenticated user.
 *
 * POST is called once immediately after supabase.auth.signUp() succeeds on the
 * frontend. The caller must supply their Supabase access_token as a Bearer
 * token so we can extract and verify their supabaseUserId server-side.
 *
 * This endpoint does NOT use requireSupabaseJwt (which requires an existing
 * Staff row) — it performs its own token verification so new users can
 * register themselves.
 *
 * On login after email confirmation (where the Staff row may not yet exist),
 * the frontend retries this endpoint with idempotent semantics: a 409 means
 * the row already exists and the client can proceed normally.
 *
 * GET /api/staff/me requires a valid Supabase JWT (Bearer token).
 * Returns { id, name, role } for the authenticated user from the Staff table.
 * Used by the frontend to enforce role matching after sign-in.
 */

import { Router, type Router as RouterType, type Request, type Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getPrismaClient } from '../db/prismaClient';

export const staffRouter: RouterType = Router();

const CreateStaffBody = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  role: z.enum(['DOCTOR', 'RECEPTIONIST']),
  supabaseUserId: z.string().uuid().optional(),
});

// ─── GET /api/staff/me ────────────────────────────────────────────────────────
//
// Returns the authenticated user's Staff record { id, name, role }.
// Requires a valid Supabase Bearer JWT in the Authorization header.
// Returns 401 if the token is missing/invalid.
// Returns 403 if no Staff row exists for this user.

staffRouter.get('/me', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header.' });
    return;
  }

  const token = authHeader.slice(7);

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  const db = getPrismaClient();
  if (!db) {
    res.status(503).json({ error: 'Database unavailable.' });
    return;
  }

  const staff = await db.staff.findUnique({
    where: { supabaseUserId: user.id },
    select: { id: true, name: true, role: true },
  });

  if (!staff) {
    res.status(403).json({ error: 'No staff account found for this user.' });
    return;
  }

  res.json({ id: staff.id, name: staff.name, role: staff.role.toLowerCase() });
});

// ─── POST /api/staff ──────────────────────────────────────────────────────────

staffRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  // 1. Validate body
  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: 'Invalid request body.', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { name, role, supabaseUserId } = parsed.data;

  // 2. Determine the target user ID (from token or body)
  let targetUserId = supabaseUserId;

  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (!authError && user) {
      targetUserId = user.id;
    }
  }

  if (!targetUserId) {
    res.status(401).json({ error: 'Must provide a valid Bearer token or supabaseUserId.' });
    return;
  }

  // Verify the user actually exists in Supabase Auth
  const { data: { user: adminUser }, error: adminError } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
  if (adminError || !adminUser) {
    res.status(400).json({ error: 'Invalid supabaseUserId: user does not exist in Auth.' });
    return;
  }

  const db = getPrismaClient();
  if (!db) {
    res.status(503).json({ error: 'Database unavailable.' });
    return;
  }

  // 3. Idempotent: if the Staff row already exists, return 409.
  const existing = await db.staff.findUnique({ where: { supabaseUserId: targetUserId } });
  if (existing) {
    res.status(409).json({ error: 'Staff account already exists for this user.' });
    return;
  }

  // 4. Create the Staff row
  const staff = await db.staff.create({
    data: { supabaseUserId: targetUserId, name, role },
  });

  res.status(201).json({ id: staff.id, name: staff.name, role: staff.role });
});

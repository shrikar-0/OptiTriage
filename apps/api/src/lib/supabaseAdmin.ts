/**
 * src/lib/supabaseAdmin.ts
 *
 * Supabase service-role client for server-side operations.
 *
 * This client bypasses Row Level Security and has full database access.
 * It must NEVER be exposed to the browser or included in client bundles.
 *
 * Used by:
 *   - requireSupabaseJwt middleware (token verification + Staff lookup)
 *   - staff route (token verification on sign-up)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env['SUPABASE_URL'];
const supabaseServiceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    '[supabaseAdmin] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your environment.',
  );
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    // Server-side client — no token refresh or session persistence needed.
    autoRefreshToken: false,
    persistSession: false,
  },
});

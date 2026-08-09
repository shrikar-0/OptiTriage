/**
 * src/lib/supabaseClient.ts
 *
 * Supabase browser client for the doctor dashboard.
 * Initialised once and exported as a singleton.
 *
 * Uses the public anon key — safe for the browser. Row Level Security
 * enforced in Supabase controls what the anon key can access.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[supabaseClient] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

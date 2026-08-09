/**
 * src/hooks/useAuth.ts
 *
 * React hook that exposes the current Supabase auth session.
 *
 * On mount, calls getSession() to hydrate from the Supabase local storage
 * cache (no extra network round-trip). Then subscribes to onAuthStateChange
 * so any token refresh or sign-out updates state automatically.
 *
 * Role is read from session.user.user_metadata.role which is set during
 * sign-up — avoids a database round-trip on every page load.
 */

import { useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

export interface AuthState {
  user: User | null;
  session: Session | null;
  /** Role sourced from user_metadata — set at sign-up time. */
  role: 'doctor' | 'receptionist' | null;
  /** True while the initial getSession() call is in-flight. */
  isLoading: boolean;
}

export interface UseAuthReturn extends AuthState {
  signOut: () => Promise<void>;
}

function extractRole(user: User | null | undefined): 'doctor' | 'receptionist' | null {
  const raw = user?.user_metadata?.['role'] as string | undefined;
  if (raw === 'doctor' || raw === 'receptionist') return raw;
  return null;
}

export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    role: null,
    isLoading: true,
  });

  useEffect(() => {
    // Hydrate session from local cache (synchronous-ish, no network)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({
        user: session?.user ?? null,
        session,
        role: extractRole(session?.user),
        isLoading: false,
      });
    });

    // Keep in sync with token refreshes, signIn, signOut
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({
        user: session?.user ?? null,
        session,
        role: extractRole(session?.user),
        isLoading: false,
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    // onAuthStateChange will fire and clear state automatically
  };

  return { ...state, signOut };
}

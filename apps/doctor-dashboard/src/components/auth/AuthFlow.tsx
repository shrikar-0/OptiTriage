import React, { useState, useEffect } from 'react';
import LoginForm from './LoginForm';
import { supabase } from '../../lib/supabaseClient';
import type { Session } from '@supabase/supabase-js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

interface AuthFlowProps {
  onAuthenticated: (role: 'doctor' | 'receptionist') => void;
  initialRole: 'doctor' | 'receptionist';
  /** Called when the logged-in user's DB role doesn't match the selected role. */
  onRoleMismatch?: () => void;
  /** Called when the user clicks "Back" on the login form. */
  onBack?: () => void;
}

const AuthFlow: React.FC<AuthFlowProps> = ({
  onAuthenticated,
  initialRole,
  onRoleMismatch,
  onBack,
}) => {
  const [selectedRole] =
    useState<'doctor' | 'receptionist'>(initialRole);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Shared role enforcement after a successful Supabase sign-in ───────────

  /**
   * Queries GET /api/staff/me to get the user's actual DB role, then compares
   * it against the role they selected on the role-selection screen.
   *
   * Returns true  → roles match, caller may proceed.
   * Returns false → mismatch; this function has already signed the user out,
   *                 set an inline error, and scheduled onRoleMismatch().
   */
  const enforceRoleMatch = async (
    accessToken: string,
    selectedRoleArg: 'doctor' | 'receptionist',
  ): Promise<boolean> => {
    let actualRole: string | null = null;

    try {
      const res = await fetch(`${API_BASE_URL}/api/staff/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.ok) {
        const body = (await res.json()) as { role?: string };
        // API returns lowercase role string ('doctor' | 'receptionist')
        actualRole = (body.role ?? '').toLowerCase();
      } else if (res.status === 403) {
        // No Staff row yet (new sign-up) — allow through.
        return true;
      }
    } catch {
      // Network error — allow through rather than block login entirely.
      return true;
    }

    if (actualRole && actualRole !== selectedRoleArg) {
      // Role mismatch — sign the user out immediately.
      await supabase.auth.signOut();

      const actualRoleLabel = actualRole === 'doctor' ? 'Doctor' : 'Receptionist';

      setError(
        `This account is registered as a ${actualRoleLabel}. ` +
          `Please select ${actualRoleLabel} on the previous screen.`,
      );
      setIsLoading(false);

      // Let the user read the error for a moment, then reset to role selection.
      setTimeout(() => {
        onRoleMismatch?.();
      }, 2800);

      return false;
    }

    return true;
  };

  // ── Log In ────────────────────────────────────────────────────────────────

  const handleLogin = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);

    const { data, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (authError || !data.session) {
      setIsLoading(false);

      const msg =
        authError?.message ?? 'Sign-in failed. Please try again.';

      if (msg.toLowerCase().includes('invalid login credentials')) {
        setError('Email or password is incorrect.');
      } else if (msg.toLowerCase().includes('email not confirmed')) {
        setError(
          'Please confirm your email address before signing in.',
        );
      } else {
        setError(msg);
      }

      return;
    }

    const { session } = data;

    // ── BUG 2 FIX: Verify the role in the Staff DB before proceeding ─────
    const roleOk = await enforceRoleMatch(session.access_token, selectedRole);
    if (!roleOk) return; // enforceRoleMatch already set error + signed out

    // Ensure the Staff row exists (idempotent — 409 means it already exists).
    const storedName = session.user.user_metadata?.['name'] as string | undefined;
    const storedRole = session.user.user_metadata?.['role'] as string | undefined;

    if (storedName && storedRole) {
      await fetch(`${API_BASE_URL}/api/staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: storedName,
          role: storedRole.toUpperCase(),
        }),
      });
    }

    setIsLoading(false);
    onAuthenticated(selectedRole);
  };

  // ── Sign Up ───────────────────────────────────────────────────────────────

  const handleSignUp = async (
    fullName: string,
    email: string,
    password: string,
    role: string,
  ) => {
    setIsLoading(true);
    setError(null);

    // Store name and role in user_metadata so they survive email confirmation.
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: fullName, role },
      },
    });

    if (authError) {
      setIsLoading(false);

      const msg = authError.message;

      if (
        msg.toLowerCase().includes('already registered') ||
        msg.toLowerCase().includes('user already exists')
      ) {
        setError(
          'An account with this email already exists. Try logging in instead.',
        );
      } else {
        setError(msg);
      }

      return;
    }

    const { session, user } = data;

    // Register the Staff row immediately.
    // If email confirmation is enabled there may be no session,
    // so send supabaseUserId in the request body.
    if (user) {
      const staffRes = await fetch(`${API_BASE_URL}/api/staff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session && {
            Authorization: `Bearer ${session.access_token}`,
          }),
        },
        body: JSON.stringify({
          name: fullName,
          role: role.toUpperCase(),
          supabaseUserId: user.id,
        }),
      });

      if (!staffRes.ok && staffRes.status !== 409) {
        const body = await staffRes.json().catch(() => ({}));
        setIsLoading(false);
        setError(
          (body as { error?: string }).error ??
            'Failed to create staff account.',
        );
        return;
      }
    }

    // If Supabase returned a session immediately, we're done.
    if (session) {
      setIsLoading(false);
      onAuthenticated(role as 'doctor' | 'receptionist');
      return;
    }

    // Email confirmation required.
    setIsLoading(false);
    setError(
      'Account created! Please check your email to confirm your address, then log in.',
    );
  };

  return (
    <LoginForm
      role={selectedRole}
      onBack={() => {
        if (onBack) {
          onBack();
        } else {
          window.location.reload();
        }
      }}
      onLogin={handleLogin}
      onSignUp={handleSignUp}
      isLoading={isLoading}
      error={error}
    />
  );
};

export default AuthFlow;
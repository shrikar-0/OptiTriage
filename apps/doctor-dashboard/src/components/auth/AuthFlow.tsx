import React, { useState } from 'react';
import RoleSelection from './RoleSelection';
import LoginForm from './LoginForm';
import { supabase } from '../../lib/supabaseClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

interface AuthFlowProps {
  onAuthenticated: (role: 'doctor' | 'receptionist') => void;
  initialRole: 'doctor' | 'receptionist';
}

const AuthFlow: React.FC<AuthFlowProps> = ({
  onAuthenticated,
  initialRole,
}) => {
  const [selectedRole, setSelectedRole] =
    useState<'doctor' | 'receptionist'>(initialRole);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRoleSelect = (role: 'doctor' | 'receptionist') => {
    setSelectedRole(role);
    setError(null);
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
      } else if (
        msg.toLowerCase().includes('email not confirmed')
      ) {
        setError(
          'Please confirm your email address before signing in.',
        );
      } else {
        setError(msg);
      }

      return;
    }

    const { session } = data;

    // Ensure the Staff row exists.
    // A 409 means the row already exists.
    const storedName = session.user.user_metadata?.['name'] as
      | string
      | undefined;

    const storedRole = session.user.user_metadata?.['role'] as
      | string
      | undefined;

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

    // Verify the role in user_metadata if it exists.
    const userRole = storedRole as
      | 'doctor'
      | 'receptionist'
      | undefined;

    setIsLoading(false);

    onAuthenticated(
      (userRole ?? 'doctor') as 'doctor' | 'receptionist',
    );
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

    // Store name and role in user_metadata so they survive
    // email confirmation.
    const { data, error: authError } =
      await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: fullName,
            role,
          },
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
    // If email confirmation is enabled, there may be no session,
    // so send supabaseUserId in the request body.
    if (user) {
      const staffRes = await fetch(
        `${API_BASE_URL}/api/staff`,
        {
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
        },
      );

      if (!staffRes.ok && staffRes.status !== 409) {
        const body = await staffRes
          .json()
          .catch(() => ({}));

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

      onAuthenticated(
        role as 'doctor' | 'receptionist',
      );

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
        window.location.reload();
      }}
      onLogin={handleLogin}
      onSignUp={handleSignUp}
      isLoading={isLoading}
      error={error}
    />
  );
};

export default AuthFlow;
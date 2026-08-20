import { useAuth } from './hooks/useAuth';
import AuthFlow from './components/auth/AuthFlow';
import Dashboard from './pages/Dashboard';
import ReceptionistDashboard from './pages/ReceptionistDashboard';
import RoleSelection from './components/auth/RoleSelection';
import { useState } from 'react';

/**
 * App-level auth state machine:
 *
 *  'role-select'  → User sees the role selection screen.
 *                   Transitions to 'login' when a role card is clicked.
 *
 *  'login'        → AuthFlow is shown. It will:
 *                     a) Sign the user in (or confirm existing session role).
 *                     b) Call onAuthenticated(role) on success.
 *                     c) Call onRoleMismatch() if the DB role ≠ selected role.
 *                     d) Call onBack() if the user clicks "← Back".
 *                   Transitions to 'dashboard' on success,
 *                   back to 'role-select' on mismatch or back.
 *
 *  'dashboard'    → The correct dashboard for the verified role is rendered.
 *                   Sign-out transitions back to 'role-select'.
 */
type AppState = 'role-select' | 'login' | 'dashboard';

export default function App() {
  const { session, isLoading, signOut } = useAuth();
  const [appState, setAppState] = useState<AppState>('role-select');
  const [selectedRole, setSelectedRole] = useState<'doctor' | 'receptionist' | null>(null);

  // ── Initial loading splash ───────────────────────────────────────────────────
  // Prevents flash of auth screen while Supabase hydrates from cache.
  if (isLoading) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ backgroundColor: '#FDF1DB' }}
      >
        <svg
          className="h-8 w-8 animate-spin"
          style={{ color: '#4F8FA8' }}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-label="Loading"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  // ── 1. Role Selection ────────────────────────────────────────────────────────
  // Always required on first visit or after sign-out / mismatch.
  // Clicking a role card always transitions to the login form regardless of
  // any cached Supabase session — fixes BUG 1.
  if (appState === 'role-select') {
    return (
      <RoleSelection
        selected={selectedRole}
        onSelect={(role) => {
          setSelectedRole(role);
          setAppState('login');
        }}
      />
    );
  }

  // ── 2. Login / Role Enforcement ──────────────────────────────────────────────
  // AuthFlow always renders here (regardless of whether session exists).
  // It will query /api/staff/me to confirm the DB role matches the selected
  // role before calling onAuthenticated — fixes BUG 2.
  if (appState === 'login') {
    return (
      <AuthFlow
        initialRole={selectedRole!}
        onAuthenticated={(_role) => {
          setAppState('dashboard');
        }}
        onRoleMismatch={() => {
          // AuthFlow has already signed the user out and shown an inline error.
          // Reset to role selection after the error message has been displayed.
          setSelectedRole(null);
          setAppState('role-select');
        }}
        onBack={() => {
          setSelectedRole(null);
          setAppState('role-select');
        }}
      />
    );
  }

  // ── 3. Dashboard ─────────────────────────────────────────────────────────────
  // Only reached after AuthFlow calls onAuthenticated (role verified).
  // Guard: if session somehow disappeared (e.g. token expired), go back.
  if (!session) {
    setAppState('role-select');
    setSelectedRole(null);
    return null;
  }

  if (selectedRole === 'receptionist') {
    return (
      <ReceptionistDashboard
        session={session}
        onSignOut={() => {
          signOut();
          setSelectedRole(null);
          setAppState('role-select');
        }}
      />
    );
  }

  return (
    <Dashboard
      session={session}
      onSignOut={() => {
        signOut();
        setSelectedRole(null);
        setAppState('role-select');
      }}
    />
  );
}
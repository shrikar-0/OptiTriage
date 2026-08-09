import { useAuth } from './hooks/useAuth';
import AuthFlow from './components/auth/AuthFlow';
import Dashboard from './pages/Dashboard';
import ReceptionistDashboard from './pages/ReceptionistDashboard';
import RoleSelection from './components/auth/RoleSelection';
import { useState } from 'react';

export default function App() {
  const { session, role: authRole, isLoading, signOut } = useAuth();
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

  // ── 1. Always demand Role Selection first ────────────────────────────────────
  if (!selectedRole) {
    return (
      <RoleSelection 
        selected={null} 
        onSelect={(role) => setSelectedRole(role)} 
      />
    );
  }

  // ── 2. Unauthenticated ───────────────────────────────────────────────────────
  if (!session) {
    return (
      <AuthFlow
        initialRole={selectedRole}
        onAuthenticated={(_role) => {
          // session will update automatically via useAuth
        }}
      />
    );
  }

  // ── 3. Authenticated ─────────────────────────────────────────────────────────
  if (selectedRole === 'receptionist') {
    return <ReceptionistDashboard session={session} onSignOut={() => { signOut(); setSelectedRole(null); }} />;
  }

  return (
    <Dashboard
      session={session}
      onSignOut={() => { signOut(); setSelectedRole(null); }}
    />
  );
}
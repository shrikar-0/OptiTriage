/**
 * TriageQueue.tsx — MERGED INTO Dashboard.tsx
 *
 * The fetch('/api/queue') + Socket.io logic that originally lived here has
 * been moved to src/pages/Dashboard.tsx (useEffect queue initialisation).
 * The queue list UI has been moved to src/components/dashboard/PatientQueue.tsx.
 *
 * This file is kept as a shell to avoid a missing-module error if any import
 * reference was accidentally left in place — but nothing should import from
 * here. Safe to delete once confirmed.
 */

export {};

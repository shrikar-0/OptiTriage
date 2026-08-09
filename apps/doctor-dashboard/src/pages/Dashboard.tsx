import { useState, useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Session } from '@supabase/supabase-js';
import Sidebar from '../components/shared/Sidebar';
import TopBar from '../components/shared/TopBar';
import PatientQueue from '../components/dashboard/PatientQueue';
import VitalsPanel, { vitalsFromQueueItem } from '../components/dashboard/VitalsPanel';
import EscalationAlert from '../components/dashboard/EscalationAlert';
import type { QueueItem } from '../types/queue';

// ─── API config ────────────────────────────────────────────────────────────────

const API_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

// ─── Sorting ──────────────────────────────────────────────────────────────────

const BAND_ORDER: Record<string, number> = { red: 0, yellow: 1, green: 2 };

function sortSessions(sessions: QueueItem[]): QueueItem[] {
  return [...sessions].sort((a, b) => {
    // Scanning and Waiting rows always float to the top
    if (a.sessionStatus === 'SCANNING' && b.sessionStatus !== 'SCANNING') return -1;
    if (a.sessionStatus !== 'SCANNING' && b.sessionStatus === 'SCANNING') return  1;
    if (a.sessionStatus === 'SCANNING' && b.sessionStatus === 'SCANNING') return  0;

    if (a.sessionStatus === 'WAITING' && b.sessionStatus !== 'WAITING') return -1;
    if (a.sessionStatus !== 'WAITING' && b.sessionStatus === 'WAITING') return  1;
    if (a.sessionStatus === 'WAITING' && b.sessionStatus === 'WAITING') return  0;

    const bA = a.ewsRiskBand ? (BAND_ORDER[a.ewsRiskBand] ?? 3) : 3;
    const bB = b.ewsRiskBand ? (BAND_ORDER[b.ewsRiskBand] ?? 3) : 3;
    if (bA !== bB) return bA - bB;

    return (b.capturedAt ?? 0) - (a.capturedAt ?? 0);
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard({
  session,
  onSignOut,
}: {
  session: Session;
  onSignOut: () => void;
}) {
  const accessToken = session.access_token;

  // ── Queue state ─────────────────────────────────────────────────────────────
  const [sessions, setSessions]               = useState<QueueItem[]>([]);
  const [queueLoading, setQueueLoading]       = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // ── Fetch + Socket.io initialisation ────────────────────────────────────────
  useEffect(() => {
    let socket: Socket | null = null;

    async function initQueue() {
      try {
        const res = await fetch(`${API_URL}/api/queue`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) {
          console.warn(`[Dashboard] Queue fetch returned ${res.status}.`);
          setSessions([]);
          return;
        }

        const data = (await res.json()) as { sessions: QueueItem[] };
        setSessions(
          sortSessions((data.sessions ?? []).map((s) => ({ ...s, isScanning: s.sessionStatus === 'SCANNING' }))),
        );
      } catch (err) {
        console.warn('[Dashboard] Queue fetch failed:', (err as Error).message);
        setSessions([]);
      } finally {
        setQueueLoading(false);
      }
    }

    initQueue();

    // ── Socket.io: live vitals + session events ────────────────────────────
    // Uses the Supabase access_token — the server socket middleware accepts
    // it via the Supabase JWT verification path (authType: 'dashboard').
    socket = io(`${API_URL}/triage`, {
      auth:       { token: accessToken },
      transports: ['websocket'],
    });

    socket.on('vitals:update', (payload: Record<string, unknown>) => {
      console.log("Doctor received vitals update:", payload);
      setSessions((prev) => {
        // Normalise the risk band label that comes from the server
        const raw = String(payload['ewsRiskBand'] ?? '').toLowerCase();
        const ewsRiskBand: 'green' | 'yellow' | 'red' =
          raw === 'low' ? 'green' : raw === 'medium' ? 'yellow' : 'red';

        const news2 = payload['news2'] as Record<string, unknown> | undefined;

        const updated: QueueItem = {
          sessionId:           payload['sessionId'] as string,
          doctorId:            '',
          patientName:         (payload['patientName'] as string) || null,
          patientAge:          (payload['patientAge'] as number) || null,
          sessionStatus:       'COMPLETED',
          createdAt:           (payload['timestamp'] as number) ?? Date.now(),
          latestScanId:        'socket-update',
          capturedAt:          payload['timestamp'] as number,
          ewsScore:            payload['ewsScore'] as number,
          ewsRiskBand,
          motionAsymmetryFlag: payload['motionAsymmetryFlag'] as boolean,
          news2TotalScore:     (news2?.['totalScore'] as number) ?? (payload['ewsScore'] as number),
          news2SingleParamAlert: (news2?.['singleParameterAlert'] as boolean) ?? false,
          news2UnobservedCount:  (news2?.['unobservedParameterCount'] as number) ?? 0,
          metrics: {
            bpm:                payload['bpm']                as number,
            hrv:                payload['hrv']                as number,
            respiratoryRate:    payload['respiratoryRate']    as number,
            motionAsymmetryFlag: payload['motionAsymmetryFlag'] as boolean,
            ewsScore:           payload['ewsScore']           as number,
            totalCycles:        payload['totalCycles']        as number | undefined,
            discardedCycles:    payload['discardedCycles']    as number | undefined,
            pulseSignal:        (payload['pulseSignal'] as number[] | undefined) ?? [],
          },
          isScanning: false,
        };

        const exists = prev.some((s) => s.sessionId === updated.sessionId);
        const next = exists
          ? prev.map((s) => (s.sessionId === updated.sessionId ? { 
              ...s, 
              ...updated, 
              patientName: s.patientName || updated.patientName,
              patientAge: s.patientAge || updated.patientAge,
              createdAt: s.createdAt || updated.createdAt
            } : s))
          : [...prev, updated];

        return sortSessions(next);
      });
    });

    socket.on('error', (err: unknown) => {
      // Expected in dev when DEV_DOCTOR_TOKEN references a non-existent session.
      console.warn('[Dashboard] Socket error (non-fatal):', err);
    });

    socket.on('session:created', (payload: any) => {
      setSessions((prev) => {
        if (prev.some((s) => s.sessionId === payload.sessionId)) return prev;
        const newItem: QueueItem = {
          sessionId:           payload.sessionId,
          doctorId:            '',
          patientName:         payload.patientName,
          patientAge:          payload.patientAge,
          sessionStatus:       'WAITING',
          createdAt:           payload.createdAt,
          latestScanId:        null,
          capturedAt:          null,
          ewsScore:            null,
          ewsRiskBand:         null,
          motionAsymmetryFlag: null,
          news2TotalScore:     null,
          news2SingleParamAlert: null,
          news2UnobservedCount:  null,
          metrics:             null,
          isScanning:          false,
        };
        return sortSessions([newItem, ...prev]);
      });
    });

    socket.on('session:status_changed', (payload: any) => {
      setSessions((prev) => {
        const exists = prev.some((s) => s.sessionId === payload.sessionId);
        if (!exists) return prev;
        
        const next = prev.map((s) => 
          s.sessionId === payload.sessionId 
            ? { ...s, sessionStatus: payload.status, isScanning: payload.status === 'SCANNING' } 
            : s
        );
        return sortSessions(next);
      });
    });

    return () => {
      socket?.disconnect();
    };
  }, []);

  // ── Derived state ────────────────────────────────────────────────────────────

  // Detail panel: pull the selected session's full data from in-memory queue.
  // No second fetch needed — metrics are already present in the queue payload.
  const selectedSession = sessions.find((s) => s.sessionId === selectedSessionId) ?? null;
  const vitals = selectedSession ? vitalsFromQueueItem(selectedSession) : null;

  // Escalation alert: red-band completed sessions only
  const escalations = sessions.filter(
    (s) => s.ewsRiskBand === 'red' && s.sessionStatus === 'COMPLETED',
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#FDF1DB' }}>
      <Sidebar activeView="doctor" onSwitch={() => {}} onSignOut={onSignOut} />

      <div
        className="flex flex-col flex-1 ml-64 overflow-hidden"
      >
        <TopBar activeView="doctor" />

        <div className="flex flex-1 mt-16 overflow-hidden">
            {/* ── Doctor: queue + detail panel ── */}
            <>
              {/* Loading shimmer */}
              {queueLoading ? (
                <div
                  className="w-80 h-full flex items-center justify-center flex-shrink-0 border-r"
                  style={{ backgroundColor: '#DFD5C6', borderColor: 'rgba(166,203,211,0.4)' }}
                >
                  <span className="text-sm animate-pulse" style={{ color: '#7A8C85' }}>
                    Loading queue…
                  </span>
                </div>
              ) : (
                <PatientQueue
                  sessions={sessions}
                  selectedId={selectedSessionId}
                  onSelect={setSelectedSessionId}
                />
              )}

              <div className="flex-1 flex flex-col overflow-hidden">
                <EscalationAlert
                  escalations={escalations}
                  onViewPatient={setSelectedSessionId}
                />
                <VitalsPanel vitals={vitals} />
              </div>
            </>
        </div>
      </div>
    </div>
  );
}
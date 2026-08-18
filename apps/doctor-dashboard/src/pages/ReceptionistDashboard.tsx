import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Session } from '@supabase/supabase-js';
import Sidebar from '../components/shared/Sidebar';
import TopBar from '../components/shared/TopBar';
import { NewPatientScanForm } from '../components/NewPatientScanForm';
import receptionistCharacterSrc from '../assets/receptionist-character.png';

const API_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

// ─── Scoped keyframes (ri- prefix: receptionist-intake) ────────────────────────

const RI_KEYFRAMES = `
  @keyframes ri-content-enter {
    0%   { opacity: 0; transform: translateY(16px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  @keyframes ri-card-enter {
    0%   { opacity: 0; transform: translateY(22px) scale(0.985); }
    100% { opacity: 1; transform: translateY(0)   scale(1); }
  }

  @keyframes ri-new-link-enter {
    0%   { opacity: 0; transform: translateY(-8px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  @keyframes ri-scanning-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(79,143,168,0.25); }
    50%      { box-shadow: 0 0 0 4px rgba(79,143,168,0.08); }
  }

  @media (prefers-reduced-motion: reduce) {
    .ri-animate { animation: none !important; opacity: 1 !important; transform: none !important; }
    .ri-scanning-badge { animation: none !important; }
  }
`;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SentLink {
  sessionId: string;
  patientName: string;
  patientAge?: number;
  scanUrl: string;
  status: 'WAITING' | 'SCANNING' | 'COMPLETED';
  sentAt: number;
}

// ─── Entrance hooks ────────────────────────────────────────────────────────────

function useEntrance(): boolean {
  const firedRef = useRef(false);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
  }, []);
  return entered;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

function contentAnim(entered: boolean, reduced: boolean, delayS: number, durationS = 0.65): CSSProperties {
  if (reduced) return { opacity: 1, transform: 'none' };
  if (!entered) return { opacity: 0, transform: 'translateY(16px)' };
  return {
    animation: `ri-content-enter ${durationS}s cubic-bezier(0.16, 1, 0.3, 1) ${delayS}s both`,
  };
}

function cardAnim(entered: boolean, reduced: boolean, delayS: number): CSSProperties {
  if (reduced) return { opacity: 1, transform: 'none' };
  if (!entered) return { opacity: 0, transform: 'translateY(22px) scale(0.985)' };
  return {
    animation: `ri-card-enter 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delayS}s both`,
  };
}

// ─── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SentLink['status'] }) {
  switch (status) {
    case 'WAITING':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
          <span
            className="material-symbols-outlined text-[13px]"
            style={{ fontVariationSettings: "'FILL' 0" }}
          >
            schedule
          </span>
          Waiting
        </span>
      );
    case 'SCANNING':
      return (
        <span
          className="ri-scanning-badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border"
          style={{
            backgroundColor: 'rgba(79,143,168,0.08)',
            color: '#4F8FA8',
            borderColor: 'rgba(79,143,168,0.25)',
            animation: 'ri-scanning-pulse 2s ease-in-out infinite',
          }}
        >
          <span
            className="material-symbols-outlined text-[13px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            monitor_heart
          </span>
          Scanning
        </span>
      );
    case 'COMPLETED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200">
          <span
            className="material-symbols-outlined text-[13px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            check_circle
          </span>
          Completed
        </span>
      );
  }
}

// ─── PatientLinkCard ───────────────────────────────────────────────────────────

function PatientLinkCard({
  link,
  timeAgo,
  onCopy,
  onOpen,
  isNew,
  reduced,
}: {
  link: SentLink;
  timeAgo: string;
  onCopy: () => void;
  onOpen: () => void;
  isNew: boolean;
  reduced: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const newLinkStyle: CSSProperties = isNew && !reduced
    ? { animation: 'ri-new-link-enter 0.45s cubic-bezier(0.16, 1, 0.3, 1) both' }
    : {};

  return (
    <div
      className="ri-animate bg-white rounded-xl border p-5 flex flex-col gap-3"
      style={{
        borderColor: 'rgba(79,143,168,0.13)',
        boxShadow: '3px 4px 16px -4px rgba(79,143,168,0.08), 1px 2px 6px -2px rgba(26,46,53,0.05)',
        transition: 'box-shadow 200ms ease, transform 200ms cubic-bezier(0.16,1,0.3,1)',
        ...newLinkStyle,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow =
          '4px 6px 22px -4px rgba(79,143,168,0.14), 2px 3px 10px -2px rgba(26,46,53,0.08)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow =
          '3px 4px 16px -4px rgba(79,143,168,0.08), 1px 2px 6px -2px rgba(26,46,53,0.05)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="font-semibold text-base" style={{ color: '#1a2e35' }}>
            {link.patientName}
            {link.patientAge ? (
              <span className="text-sm font-normal ml-2" style={{ color: '#7A8C85' }}>
                {link.patientAge} yrs
              </span>
            ) : null}
          </span>
          <span className="text-xs mt-0.5" style={{ color: '#7A8C85' }}>{timeAgo}</span>
        </div>
        <StatusBadge status={link.status} />
      </div>

      <div className="flex items-center gap-2 mt-1">
        <div
          className="flex-1 rounded-lg px-3 py-2 text-xs font-mono overflow-hidden text-ellipsis whitespace-nowrap"
          style={{
            backgroundColor: '#FAF6F0',
            border: '1px solid rgba(166,99,43,0.12)',
            color: '#7A8C85',
          }}
        >
          {link.scanUrl}
        </div>
        <button
          onClick={handleCopy}
          title="Copy link to clipboard"
          className="shrink-0 flex items-center justify-center h-[34px] px-3.5 rounded-lg text-white text-xs font-semibold gap-1.5"
          style={{
            backgroundColor: copied ? '#16a34a' : '#4F8FA8',
            transition: 'background-color 200ms ease, transform 160ms cubic-bezier(0.16,1,0.3,1), box-shadow 200ms ease',
            boxShadow: '2px 3px 8px -2px rgba(79,143,168,0.18)',
          }}
          onMouseEnter={(e) => {
            if (!copied) e.currentTarget.style.backgroundColor = '#3d7a91';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = copied ? '#16a34a' : '#4F8FA8';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <span className="material-symbols-outlined text-[15px]">
            {copied ? 'check' : 'content_copy'}
          </span>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          onClick={onOpen}
          title="Open scan link in new tab"
          className="shrink-0 flex items-center justify-center h-[34px] px-3.5 rounded-lg border text-xs font-semibold gap-1.5"
          style={{
            borderColor: 'rgba(79,143,168,0.35)',
            color: '#4F8FA8',
            transition: 'border-color 200ms ease, background-color 200ms ease, transform 160ms cubic-bezier(0.16,1,0.3,1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#4F8FA8';
            e.currentTarget.style.backgroundColor = 'rgba(79,143,168,0.06)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(79,143,168,0.35)';
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <span className="material-symbols-outlined text-[15px]">open_in_new</span>
          Open
        </button>
      </div>
    </div>
  );
}

// ─── Workflow Steps Data ───────────────────────────────────────────────────────

const WORKFLOW_STEPS = [
  { num: '01', label: 'Enter patient details', icon: 'edit_note' },
  { num: '02', label: 'Generate secure link', icon: 'link' },
  { num: '03', label: 'Patient completes triage', icon: 'vital_signs' },
] as const;

const BENEFITS = [
  { icon: 'verified_user', label: 'Secure patient sessions' },
  { icon: 'bolt', label: 'Instant link generation' },
  { icon: 'chat', label: 'WhatsApp delivery' },
] as const;

// ─── ReceptionistDashboard ─────────────────────────────────────────────────────

export default function ReceptionistDashboard({
  session,
  onSignOut,
}: {
  session: Session;
  onSignOut: () => void;
}) {
  const activeView = 'receptionist';
  const accessToken = session.access_token;
  const [links, setLinks] = useState<SentLink[]>([]);
  const [now, setNow] = useState(Date.now());

  // Track the most recently added link for entrance animation
  const newestIdRef = useRef<string | null>(null);

  const entered = useEntrance();
  const reduced = usePrefersReducedMotion();

  // Update "time ago" string every minute
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Socket.io for live status updates
  useEffect(() => {
    const socket: Socket = io(`${API_URL}/triage`, {
      auth: { token: accessToken },
      transports: ['websocket'],
    });

    socket.on('session:status_changed', (payload: any) => {
      setLinks((prev) =>
        prev.map((l) =>
          l.sessionId === payload.sessionId
            ? { ...l, status: payload.status }
            : l
        )
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [accessToken]);

  const handleSuccess = (data: { patientName: string; patientAge?: number; scanUrl: string; sessionId: string; status: 'WAITING' }) => {
    newestIdRef.current = data.sessionId;
    setLinks((prev) => [
      {
        sessionId: data.sessionId,
        patientName: data.patientName,
        patientAge: data.patientAge,
        scanUrl: data.scanUrl,
        status: data.status,
        sentAt: Date.now(),
      },
      ...prev,
    ]);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const getTimeAgo = (timestamp: number) => {
    const diffMins = Math.floor((now - timestamp) / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 min ago';
    if (diffMins < 60) return `${diffMins} mins ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#FDF1DB' }}>
      <style>{RI_KEYFRAMES}</style>
      <Sidebar activeView={activeView} onSwitch={() => {}} onSignOut={onSignOut} />

      <div className="flex flex-col flex-1 overflow-hidden pl-64">
        <TopBar activeView={activeView} />

        <div className="flex-1 mt-16 overflow-y-auto">
          <div className="max-w-[1200px] mx-auto px-8 py-8">

            {/* ── Two-column workspace ── */}
            <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 items-start">

              {/* ── LEFT COLUMN: Context area ── */}
              <div
                className="ri-animate w-full lg:w-[340px] lg:shrink-0 flex flex-col"
                style={contentAnim(entered, reduced, 0.05)}
              >
                {/* Page heading */}
                <div className="mb-8">
                  <span
                    className="block text-[10px] font-semibold uppercase tracking-[0.2em] mb-2"
                    style={{ color: '#9E6B40' }}
                  >
                    Receptionist Workspace
                  </span>
                  <h1
                    className="text-[1.7rem] font-bold leading-tight tracking-tight"
                    style={{ color: '#1a2e35', letterSpacing: '-0.02em' }}
                  >
                    Patient Intake
                  </h1>
                  <p
                    className="text-sm mt-2 leading-relaxed"
                    style={{ color: '#7A8C85' }}
                  >
                    Create a secure triage session and send the assessment link directly to your patient.
                  </p>
                </div>

                {/* Workflow steps */}
                <div
                  className="ri-animate flex flex-col gap-4 mb-8"
                  style={contentAnim(entered, reduced, 0.2)}
                >
                  {WORKFLOW_STEPS.map((step, i) => (
                    <div key={step.num} className="flex items-start gap-3.5">
                      <div
                        className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
                        style={{
                          backgroundColor: 'rgba(79,143,168,0.08)',
                          border: '1px solid rgba(79,143,168,0.15)',
                        }}
                      >
                        <span
                          className="material-symbols-outlined text-[18px]"
                          style={{ color: '#4F8FA8', fontVariationSettings: "'FILL' 0" }}
                        >
                          {step.icon}
                        </span>
                      </div>
                      <div className="flex flex-col pt-1">
                        <span
                          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                          style={{ color: '#9E6B40' }}
                        >
                          Step {step.num}
                        </span>
                        <span
                          className="text-sm font-medium"
                          style={{ color: '#1a2e35' }}
                        >
                          {step.label}
                        </span>
                      </div>
                      {i < WORKFLOW_STEPS.length - 1 && (
                        <div
                          className="absolute ml-[18px] mt-[44px] w-px h-4"
                          style={{ backgroundColor: 'rgba(79,143,168,0.15)' }}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Benefits */}
                <div
                  className="ri-animate flex flex-col gap-2.5 mb-8"
                  style={contentAnim(entered, reduced, 0.35)}
                >
                  {BENEFITS.map((b) => (
                    <div key={b.label} className="flex items-center gap-2.5">
                      <span
                        className="material-symbols-outlined text-[16px]"
                        style={{ color: '#4F8FA8', fontVariationSettings: "'FILL' 1" }}
                      >
                        {b.icon}
                      </span>
                      <span className="text-xs font-medium" style={{ color: '#5C6460' }}>
                        {b.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Receptionist illustration */}
                <div
                  className="ri-animate hidden lg:block mt-auto"
                  style={contentAnim(entered, reduced, 0.5)}
                >
                  <img
                    src={receptionistCharacterSrc}
                    alt=""
                    draggable={false}
                    className="pointer-events-none select-none"
                    style={{
                      width: '280px',
                      maxWidth: '100%',
                      opacity: 0.18,
                      marginLeft: '-20px',
                      marginBottom: '-16px',
                    }}
                  />
                </div>
              </div>

              {/* ── RIGHT COLUMN: Form + Links ── */}
              <div className="flex-1 min-w-0 flex flex-col gap-8">

                {/* ── Intake Form Card ── */}
                <div
                  className="ri-animate"
                  style={cardAnim(entered, reduced, 0.15)}
                >
                  <div
                    className="bg-white rounded-2xl px-8 py-8 flex flex-col gap-4"
                    style={{
                      border: '1px solid rgba(79,143,168,0.12)',
                      boxShadow: '6px 8px 28px -4px rgba(79,143,168,0.10), 3px 4px 12px -2px rgba(26,46,53,0.06)',
                    }}
                  >
                    <div className="flex items-center gap-2.5 mb-1">
                      <div
                        className="flex items-center justify-center w-10 h-10 rounded-xl"
                        style={{
                          backgroundColor: 'rgba(79,143,168,0.08)',
                          border: '1px solid rgba(79,143,168,0.15)',
                        }}
                      >
                        <span
                          className="material-symbols-outlined text-[20px]"
                          style={{ color: '#4F8FA8', fontVariationSettings: "'FILL' 1" }}
                        >
                          person_add
                        </span>
                      </div>
                      <div>
                        <span
                          className="font-bold text-lg block leading-tight"
                          style={{ color: '#1a2e35' }}
                        >
                          New Patient Intake
                        </span>
                        <span className="text-xs" style={{ color: '#7A8C85' }}>
                          Create a secure triage session for a patient.
                        </span>
                      </div>
                    </div>

                    {/* Divider */}
                    <div
                      className="h-px w-full"
                      style={{ backgroundColor: 'rgba(79,143,168,0.10)' }}
                    />

                    <NewPatientScanForm accessToken={accessToken} onSuccess={handleSuccess} />
                  </div>
                </div>

                {/* ── Recent Patient Links ── */}
                {links.length > 0 && (
                  <div
                    className="ri-animate"
                    style={contentAnim(entered, reduced, 0.4)}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <span
                        className="material-symbols-outlined text-[20px]"
                        style={{ color: '#4F8FA8', fontVariationSettings: "'FILL' 0" }}
                      >
                        history
                      </span>
                      <h2
                        className="text-base font-bold"
                        style={{ color: '#1a2e35' }}
                      >
                        Recent Patient Links
                      </h2>
                      <span
                        className="ml-1 flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[10px] font-bold"
                        style={{
                          backgroundColor: 'rgba(79,143,168,0.10)',
                          color: '#4F8FA8',
                        }}
                      >
                        {links.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-3">
                      {links.map((link) => (
                        <PatientLinkCard
                          key={link.sessionId}
                          link={link}
                          timeAgo={getTimeAgo(link.sentAt)}
                          onCopy={() => copyToClipboard(link.scanUrl)}
                          onOpen={() => window.open(link.scanUrl, '_blank', 'noopener,noreferrer')}
                          isNew={link.sessionId === newestIdRef.current}
                          reduced={reduced}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

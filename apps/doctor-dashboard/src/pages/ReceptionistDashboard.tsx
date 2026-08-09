import { useState, useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Session } from '@supabase/supabase-js';
import Sidebar from '../components/shared/Sidebar';
import TopBar from '../components/shared/TopBar';
import { NewPatientScanForm } from '../components/NewPatientScanForm';

const API_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

interface SentLink {
  sessionId: string;
  patientName: string;
  patientAge?: number;
  scanUrl: string;
  status: 'WAITING' | 'SCANNING' | 'COMPLETED';
  sentAt: number;
}

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
      // Could show a toast here in a real app
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

  const getStatusBadge = (status: SentLink['status']) => {
    switch (status) {
      case 'WAITING':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">Waiting</span>;
      case 'SCANNING':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200">Scanning</span>;
      case 'COMPLETED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200">Completed</span>;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#FDF1DB' }}>
      <Sidebar activeView={activeView} onSwitch={() => {}} onSignOut={onSignOut} />

      <div className="flex flex-col flex-1 overflow-hidden pl-64">
        <TopBar activeView={activeView} />

        <div className="flex-1 mt-16 overflow-y-auto p-8 flex flex-col items-center">
          {/* Intake Form */}
          <div className="w-full max-w-lg mb-8">
            <div className="bg-white rounded-2xl shadow-sm border border-[rgba(79,143,168,0.15)] px-8 py-8 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-[22px]"
                  style={{ color: '#4F8FA8', fontVariationSettings: "'FILL' 1" }}
                >
                  person_add
                </span>
                <span className="font-semibold text-lg" style={{ color: '#1a2e35' }}>
                  New Patient Intake
                </span>
              </div>
              <p className="text-sm" style={{ color: '#7A8C85' }}>
                Enter the patient's details to generate a secure scan link.
              </p>
              <NewPatientScanForm accessToken={accessToken} onSuccess={handleSuccess} />
            </div>
          </div>

          {/* Sent Links List */}
          {links.length > 0 && (
            <div className="w-full max-w-lg">
              <h2 className="text-lg font-bold mb-4" style={{ color: '#1a2e35' }}>Sent Links</h2>
              <div className="flex flex-col gap-4">
                {links.map((link) => (
                  <div key={link.sessionId} className="bg-white rounded-xl shadow-sm border border-[rgba(79,143,168,0.15)] p-5 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="font-semibold text-base" style={{ color: '#1a2e35' }}>
                          {link.patientName}{link.patientAge ? `, ${link.patientAge}` : ''}
                        </span>
                        <span className="text-xs" style={{ color: '#7A8C85' }}>{getTimeAgo(link.sentAt)}</span>
                      </div>
                      {getStatusBadge(link.status)}
                    </div>
                    
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-500 overflow-hidden text-ellipsis whitespace-nowrap">
                        {link.scanUrl}
                      </div>
                      <button
                        onClick={() => copyToClipboard(link.scanUrl)}
                        title="Copy link to clipboard"
                        className="shrink-0 flex items-center justify-center h-[34px] px-3 rounded-lg bg-[#4F8FA8] hover:bg-[#3d7a91] text-white transition-colors text-xs font-semibold gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[16px]">content_copy</span>
                        Copy
                      </button>
                      <button
                        onClick={() => window.open(link.scanUrl, '_blank', 'noopener,noreferrer')}
                        title="Open scan link in new tab"
                        className="shrink-0 flex items-center justify-center h-[34px] px-3 rounded-lg border border-[rgba(79,143,168,0.4)] hover:border-[#4F8FA8] text-[#4F8FA8] hover:bg-[rgba(79,143,168,0.08)] transition-colors text-xs font-semibold gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                        Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import type { QueueItem } from '../../types/queue';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BAND_COLORS: Record<'green' | 'yellow' | 'red', string> = {
  red:    '#D64045',
  yellow: '#E8A838',
  green:  '#96AB88',
};

function relativeTime(capturedAt: number): string {
  const diffSec = Math.floor((Date.now() - capturedAt) / 1000);
  if (diffSec < 90)   return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  return `${Math.floor(diffSec / 3600)} hr ago`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PatientQueueProps {
  sessions: QueueItem[];
  selectedId: string | null;
  onSelect: (sessionId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PatientQueue({ sessions, selectedId, onSelect }: PatientQueueProps) {
  return (
    <div
      className="w-80 h-full flex flex-col flex-shrink-0 overflow-hidden border-r"
      style={{ backgroundColor: '#DFD5C6', borderColor: 'rgba(166,203,211,0.4)' }}
    >
      {/* Header */}
      <div
        className="px-4 py-4 sticky top-0 z-10 flex justify-between items-center border-b"
        style={{
          backgroundColor: 'rgba(223,213,198,0.92)',
          backdropFilter: 'blur(8px)',
          borderColor: 'rgba(166,203,211,0.3)',
        }}
      >
        <h3 className="font-semibold text-lg" style={{ color: '#2C3E35' }}>
          Patient Queue
        </h3>
        <span
          className="text-xs font-semibold px-2 py-1 rounded-full border"
          style={{
            color: '#4F8FA8',
            borderColor: 'rgba(79,143,168,0.3)',
            backgroundColor: 'rgba(79,143,168,0.08)',
          }}
        >
          {sessions.filter(s => s.sessionStatus === 'COMPLETED').length} completed
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          /* ── Empty state ── */
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
            <span
              className="material-symbols-outlined opacity-20"
              style={{ fontSize: '48px', color: '#2C3E35' }}
            >
              group
            </span>
            <p className="text-sm font-medium" style={{ color: '#7A8C85' }}>
              No patients yet
            </p>
            <p className="text-xs" style={{ color: '#7A8C85', opacity: 0.7 }}>
              Send a scan link to a patient — their vitals will appear here once
              a scan completes.
            </p>
          </div>
        ) : (
          sessions.map((session) => {
            const isSelected = session.sessionId === selectedId;
            const borderColor = session.ewsRiskBand
              ? BAND_COLORS[session.ewsRiskBand]
              : 'rgba(79,143,168,0.3)';

            return (
              <div
                key={session.sessionId}
                onClick={() => session.sessionStatus === 'COMPLETED' && onSelect(session.sessionId)}
                className="flex flex-col py-4 px-4 border-l-4 transition-colors"
                style={{
                  borderLeftColor: borderColor,
                  backgroundColor: isSelected ? 'rgba(79,143,168,0.1)' : 'transparent',
                  cursor: session.sessionStatus === 'COMPLETED' ? 'pointer' : 'default',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected && session.sessionStatus === 'COMPLETED')
                    (e.currentTarget as HTMLDivElement).style.backgroundColor =
                      'rgba(0,0,0,0.04)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected)
                    (e.currentTarget as HTMLDivElement).style.backgroundColor =
                      isSelected ? 'rgba(79,143,168,0.1)' : 'transparent';
                }}
              >
                <div className="flex justify-between items-start mb-1">
                  <h4 className="font-bold text-[15px]" style={{ color: '#1C2B2B' }}>
                    {session.patientName || `Session ${session.sessionId.slice(0, 8)}…`}
                    {session.patientAge && (
                      <span className="font-normal text-sm ml-1" style={{ color: '#7A8C85' }}>
                        ({session.patientAge}y)
                      </span>
                    )}
                  </h4>
                  
                  {/* Status Badge */}
                  {session.sessionStatus === 'WAITING' && (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">
                      Waiting
                    </span>
                  )}
                  {session.sessionStatus === 'SCANNING' && (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 animate-pulse">
                      Scanning…
                    </span>
                  )}
                  {session.sessionStatus === 'COMPLETED' && session.ewsRiskBand === 'green' && (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(150,171,136,0.15)', color: '#96AB88' }}>
                      Low Risk
                    </span>
                  )}
                  {session.sessionStatus === 'COMPLETED' && session.ewsRiskBand === 'yellow' && (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(232,168,56,0.15)', color: '#E8A838' }}>
                      Medium Risk
                    </span>
                  )}
                  {session.sessionStatus === 'COMPLETED' && session.ewsRiskBand === 'red' && (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(214,64,69,0.15)', color: '#D64045' }}>
                      High Risk
                    </span>
                  )}
                </div>

                <div
                  className="flex items-center gap-2 mt-1 text-sm"
                  style={{ color: '#7A8C85' }}
                >
                  {session.sessionStatus === 'SCANNING' ? (
                    <span className="text-xs animate-pulse" style={{ color: '#4F8FA8' }}>
                      Patient is scanning…
                    </span>
                  ) : session.sessionStatus === 'WAITING' ? (
                    <span className="text-xs">
                      Registered {relativeTime(session.createdAt)}
                    </span>
                  ) : (
                    <>
                      <span>
                        {session.capturedAt ? relativeTime(session.capturedAt) : '—'}
                      </span>
                      {session.metrics && (
                        <>
                          <span className="opacity-30">•</span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">
                              monitor_heart
                            </span>
                            {Math.round(session.metrics.bpm)} BPM
                          </span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

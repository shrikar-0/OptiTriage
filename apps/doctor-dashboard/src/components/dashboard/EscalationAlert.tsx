import type { QueueItem } from '../../types/queue';

interface EscalationAlertProps {
  /** Red-band sessions drive alert banners. Pass an empty array to suppress all alerts. */
  escalations: QueueItem[];
  onViewPatient?: (sessionId: string) => void;
}

export default function EscalationAlert({ escalations, onViewPatient }: EscalationAlertProps) {
  if (!escalations.length) return null;

  return (
    <>
      {escalations.map((session) => (
        <div
          key={session.sessionId}
          className="flex items-center justify-between px-6 py-4 border-l-4"
          style={{
            backgroundColor: 'rgba(214,64,69,0.08)',
            borderLeftColor: '#D64045',
            animation: 'slide-down 0.3s ease-out',
          }}
        >
          <div className="flex items-center gap-4">
            <span className="material-symbols-outlined text-2xl" style={{ color: '#D64045' }}>
              warning
            </span>
            <div>
              <p className="font-bold text-sm" style={{ color: '#D64045' }}>
                ⚠ Critical Escalation — Session {session.sessionId.slice(0, 8)}…
              </p>
              <p className="text-sm mt-0.5" style={{ color: '#7A8C85' }}>
                NEWS2 score {session.news2TotalScore ?? session.ewsScore ?? '—'} · High Risk
                {session.capturedAt
                  ? ` · ${Math.floor((Date.now() - session.capturedAt) / 60000)} min ago`
                  : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => onViewPatient?.(session.sessionId)}
            className="px-5 py-2 rounded-lg text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#4F8FA8' }}
          >
            View Patient
          </button>
        </div>
      ))}
      <style>{`
        @keyframes slide-down {
          from { transform: translateY(-16px); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
      `}</style>
    </>
  );
}

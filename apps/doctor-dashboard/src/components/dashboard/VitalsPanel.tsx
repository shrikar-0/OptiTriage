import { useEffect, useRef } from 'react';
import type { QueueItem } from '../../types/queue';

// ─── Derived vitals shape ─────────────────────────────────────────────────────

export interface VitalsFromSession {
  sessionId: string;
  capturedAt: number;
  bpm: number;
  hrv: number;
  respRate: number;
  news2: number;
  ewsRiskBand: 'green' | 'yellow' | 'red';
  motionAsymmetryFlag: boolean;
  signalQuality: string;
  /** Raw CHROM pulse waveform samples from the completed scan. */
  pulseSignal?: number[];
}

/** Derive a VitalsFromSession from a completed QueueItem. Returns null if metrics absent. */
export function vitalsFromQueueItem(item: QueueItem): VitalsFromSession | null {
  if (!item.metrics || item.isScanning) return null;
  const { bpm, hrv, respiratoryRate, totalCycles, discardedCycles } = item.metrics;

  const discarded = discardedCycles ?? 0;
  const total = totalCycles ?? 0;
  const signalQuality =
    total === 0 ? 'Unknown'
    : discarded === 0 ? 'Strong'
    : discarded <= 1  ? 'Moderate'
    : 'Weak';

  // capturedAt arrives as a Date ISO string from the DB path, or a number from
  // the socket path. Normalise to Unix ms so time arithmetic never yields NaN.
  const rawCapturedAt = item.capturedAt as unknown;
  const capturedAtMs =
    typeof rawCapturedAt === 'number'
      ? rawCapturedAt
      : rawCapturedAt instanceof Date
        ? rawCapturedAt.getTime()
        : typeof rawCapturedAt === 'string'
          ? new Date(rawCapturedAt).getTime()
          : Date.now();

  return {
    sessionId:         item.sessionId,
    capturedAt:        capturedAtMs,
    bpm:               Math.round(bpm),
    hrv:               Math.round(hrv),
    respRate:          Math.round(respiratoryRate),
    news2:             item.news2TotalScore ?? item.ewsScore ?? 0,
    ewsRiskBand:       item.ewsRiskBand ?? 'green',
    motionAsymmetryFlag: item.motionAsymmetryFlag ?? false,
    signalQuality,
    pulseSignal:       item.metrics?.pulseSignal ?? [],
  };
}

// ─── VitalsPanel ─────────────────────────────────────────────────────────────

interface VitalsPanelProps {
  vitals: VitalsFromSession | null;
}

export default function VitalsPanel({ vitals }: VitalsPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const signal = vitals?.pulseSignal ?? [];
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(166,203,211,0.3)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 20) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    if (signal.length < 2) {
      // No signal — draw flat dashed line with label
      ctx.strokeStyle = 'rgba(79,143,168,0.3)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(122,140,133,0.6)';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('No pulse signal recorded', W / 2, H / 2 - 10);
      return;
    }

    // Normalize signal to canvas height
    const min = Math.min(...signal);
    const max = Math.max(...signal);
    const range = max - min || 1;
    const padding = 10;

    ctx.strokeStyle = '#4F8FA8';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    signal.forEach((val, i) => {
      const x = (i / (signal.length - 1)) * W;
      const y = H - padding - ((val - min) / range) * (H - padding * 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });

    ctx.stroke();
  }, [vitals?.pulseSignal]);

  // ── Empty state (no session selected) ──────────────────────────────────────
  if (!vitals) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center"
        style={{ backgroundColor: '#FDF1DB', color: '#7A8C85' }}
      >
        <span
          className="material-symbols-outlined mb-4 opacity-20"
          style={{ fontSize: '80px' }}
        >
          person
        </span>
        <h2 className="text-2xl font-semibold">Select a patient from the queue</h2>
        <p className="text-sm mt-2 opacity-60">Patient details will appear here.</p>
      </div>
    );
  }

  // ── Risk band colours ───────────────────────────────────────────────────────
  const news2Color =
    vitals.ewsRiskBand === 'red'    ? '#D64045'
    : vitals.ewsRiskBand === 'yellow' ? '#E8A838'
    : '#96AB88';
  const news2Label =
    vitals.ewsRiskBand === 'red'    ? 'High Risk'
    : vitals.ewsRiskBand === 'yellow' ? 'Medium Risk'
    : 'Low Risk';

  // Session elapsed time — capturedAt may arrive as an ISO string (DB path) or number (socket path)
  const capturedAtMs = typeof vitals.capturedAt === 'string'
    ? new Date(vitals.capturedAt as unknown as string).getTime()
    : vitals.capturedAt;
  const elapsedSec = Math.floor((Date.now() - capturedAtMs) / 1000);
  const sessionTime =
    elapsedSec < 60
      ? `${elapsedSec}s ago`
      : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s ago`;

  const secondaryMetrics = [
    { label: 'HRV',              icon: 'vital_signs', value: vitals.hrv,      unit: 'ms'     },
    { label: 'Respiratory Rate', icon: 'air',         value: vitals.respRate, unit: 'br/min' },
  ];

  const signalColor =
    vitals.signalQuality === 'Strong'   ? '#96AB88'
    : vitals.signalQuality === 'Moderate' ? '#E8A838'
    : '#D64045';

  return (
    <div className="flex-1 overflow-y-auto p-12 pt-6" style={{ backgroundColor: '#FDF1DB' }}>

      {/* Patient header */}
      <div className="flex flex-col gap-3 mb-10">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: '#D64045' }} />
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#D64045' }}>
            Active Monitoring
          </span>
        </div>
        <h2 className="font-bold leading-tight" style={{ fontSize: '36px', color: '#2C3E35' }}>
          Session {vitals.sessionId.slice(0, 8)}…
        </h2>
        <div className="flex items-center gap-3 text-sm" style={{ color: '#7A8C85' }}>
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">timer</span>
            Captured: {sessionTime}
          </span>
          {vitals.motionAsymmetryFlag && (
            <>
              <span className="w-1 h-1 rounded-full bg-gray-300" />
              <span style={{ color: '#E8A838' }}>⚠ Motion asymmetry detected</span>
            </>
          )}
        </div>
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-lg border self-start"
          style={{
            backgroundColor: `${news2Color}18`,
            borderColor:     `${news2Color}33`,
            color:            news2Color,
          }}
        >
          <span className="material-symbols-outlined text-lg">warning</span>
          <span className="font-bold text-sm">NEWS2: {vitals.news2} — {news2Label}</span>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div
          className="col-span-2 bg-white rounded-xl p-8 relative overflow-hidden"
          style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center gap-2 mb-4" style={{ color: '#4F8FA8' }}>
            <span className="material-symbols-outlined">favorite</span>
            <span className="text-xs font-semibold uppercase tracking-wider">Heart Rate</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-bold leading-none" style={{ fontSize: '64px', color: '#2C3E35' }}>
              {vitals.bpm}
            </span>
            <span className="text-sm" style={{ color: '#7A8C85' }}>BPM</span>
          </div>
          <svg className="absolute bottom-0 right-0 w-48 h-20 opacity-40" viewBox="0 0 100 30" preserveAspectRatio="none">
            <path d="M0,25 Q10,25 20,15 T40,20 T60,5 T80,15 T100,20" fill="none" stroke="#96AB88" strokeWidth="2" />
          </svg>
        </div>

        <div className="flex flex-col gap-4">
          {secondaryMetrics.map((m) => (
            <div
              key={m.label}
              className="flex-1 bg-white rounded-xl p-4 relative overflow-hidden"
              style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
            >
              <div className="flex items-center gap-2 mb-3" style={{ color: '#4F8FA8' }}>
                <span className="material-symbols-outlined text-[18px]">{m.icon}</span>
                <span className="text-xs font-semibold uppercase tracking-wider">{m.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-bold text-4xl leading-none" style={{ color: '#2C3E35' }}>{m.value}</span>
                <span className="text-xs" style={{ color: '#7A8C85' }}>{m.unit}</span>
              </div>
              <svg className="absolute bottom-0 right-0 w-24 h-10 opacity-40" viewBox="0 0 100 30" preserveAspectRatio="none">
                <path d="M0,15 Q15,20 30,10 T60,25 T90,15 T100,10" fill="none" stroke="#96AB88" strokeWidth="2" />
              </svg>
            </div>
          ))}
        </div>
      </div>

      {/* Pulse signal waveform */}
      <div className="bg-white rounded-xl p-6 mb-6" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <div className="flex justify-between items-center mb-4">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#2C3E35' }}>
            Pulse Signal (rPPG)
          </span>
          <span className="text-sm" style={{ color: '#7A8C85' }}>
            {vitals.pulseSignal?.length
              ? `${vitals.pulseSignal.length} samples`
              : 'No data'}
          </span>
        </div>
        <canvas
          ref={canvasRef}
          width={800}
          height={120}
          className="w-full rounded-lg"
          style={{ backgroundColor: '#FAFAFA' }}
        />
      </div>

      {/* Signal quality */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#2C3E35' }}>Signal Quality</span>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: signalColor }} />
          <span className="text-xs font-semibold" style={{ color: signalColor }}>{vitals.signalQuality}</span>
        </div>
        <div className="flex gap-1 items-end">
          {[4, 6, 8, 10].map((h, i) => (
            <div key={i} className="w-2 rounded-sm" style={{ height: `${h}px`, backgroundColor: signalColor }} />
          ))}
        </div>
      </div>
    </div>
  );
}

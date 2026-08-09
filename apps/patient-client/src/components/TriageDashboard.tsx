import type { RiskClassification } from '../lib/inference/riskClassifier';

interface TriageDashboardProps {
  bpm: number | null;
  hrv: number | null;
  respRate: number | null;
  asymmetry: number | null;
  sqi: number | null;
  risk: RiskClassification | null;
  scanStatus?: 'idle' | 'scanning' | 'complete';
  currentCycle?: number;
  cycleLabel?: string;
  lowConsistencyFlag?: boolean;
  allRejected?: boolean;
  weakSignal?: boolean;
}

export function TriageDashboard({
  bpm,
  hrv,
  respRate,
  asymmetry,
  sqi,
  risk,
  scanStatus = 'idle',
  currentCycle = 1,
  cycleLabel = '',
  lowConsistencyFlag = false,
  allRejected = false,
  weakSignal = false,
}: TriageDashboardProps) {
  // Helpers for formatting
  const displayVal = (val: number | null, unit: string = '') =>
    val !== null ? `${val}${unit}` : '--';
  
  const displaySqi = sqi !== null ? Math.round(sqi * 100) : 0;
  
  // Badge colors
  let badgeColor = 'bg-gray-700 text-gray-300'; // default/unknown
  if (risk) {
    switch (risk.level) {
      case 'Low':
        badgeColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50';
        break;
      case 'Moderate':
        badgeColor = 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
        break;
      case 'High':
        badgeColor = 'bg-orange-500/20 text-orange-400 border-orange-500/50';
        break;
      case 'Critical':
        badgeColor = 'bg-red-500/20 text-red-400 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.5)]';
        break;
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-4 rounded-xl border border-gray-800 bg-gray-900/50 p-6 backdrop-blur-md">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-4 gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            {scanStatus === 'complete' ? 'Final Combined Results' : 'Live Triage Dashboard'}
          </h2>
          {scanStatus === 'scanning' && (
            <p className="text-xs text-emerald-400 mt-1 font-medium">
              Scanning: Cycle {currentCycle}
            </p>
          )}
          {scanStatus === 'complete' && cycleLabel && (
            <p className="text-xs text-gray-400 mt-1 font-medium">
              {cycleLabel}
            </p>
          )}
        </div>
        
        {/* Risk Badge + optional partial-data qualifier */}
        <div className="flex flex-col items-end gap-1.5">
          <div className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold uppercase tracking-wider transition-colors ${badgeColor}`}>
            <span className="relative flex h-2 w-2">
              {(risk?.level === 'High' || risk?.level === 'Critical') && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75"></span>
              )}
              <span className="relative inline-flex h-2 w-2 rounded-full bg-current"></span>
            </span>
            {risk ? `${risk.level} RISK` : 'ANALYZING...'}
          </div>
          {risk?.isPartial && (
            <span className="flex items-center gap-1 rounded-full bg-gray-800 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
              <svg className="h-2.5 w-2.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              Limited signal
            </span>
          )}
        </div>
      </div>

      {lowConsistencyFlag && (
        <div className="mt-2 rounded-lg bg-orange-500/10 border border-orange-500/30 p-3">
          <p className="text-sm text-orange-400 font-medium flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Low consistency between measurement cycles. Consider rescanning.
          </p>
        </div>
      )}

      {allRejected && (
        <div className="mt-2 rounded-lg bg-red-500/10 border border-red-500/30 p-3">
          <p className="text-sm text-red-400 font-medium flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            All measurement cycles were rejected due to high motion. A rescan is required.
          </p>
        </div>
      )}

      {weakSignal && !allRejected && (
        <div className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
          <p className="text-sm text-amber-400 font-medium flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Signal too weak for a reliable reading — try better lighting or hold still. Any partial results shown below may be inaccurate.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        {/* Left Column: Signals & SQI */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg bg-black/40 p-4">
            <div className="mb-2 flex items-center justify-between text-sm font-medium text-gray-400">
              <span>PPG Waveform</span>
              <span className="text-xs">simulated</span>
            </div>
            {/* Animated Waveform Placeholder */}
            <div className="relative h-20 w-full overflow-hidden rounded bg-gray-950 border border-gray-800 flex items-center justify-center">
               {sqi !== null && sqi > 0.3 ? (
                  <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <polyline
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2"
                      points="0,50 10,50 15,20 20,80 25,45 30,55 35,50 100,50"
                      className="animate-[dash_2s_linear_infinite]"
                      strokeDasharray="100"
                      strokeDashoffset="100"
                    />
                    <style>{`
                      @keyframes dash {
                        to { stroke-dashoffset: 0; }
                      }
                    `}</style>
                  </svg>
               ) : (
                  <span className="text-xs text-gray-600 font-mono tracking-widest uppercase">Acquiring Signal</span>
               )}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg bg-black/40 p-4">
            <div className="flex justify-between text-sm font-medium">
              <span className="text-gray-400">Signal Quality (SQI)</span>
              <span className={displaySqi >= 80 ? 'text-emerald-400' : displaySqi >= 40 ? 'text-yellow-400' : 'text-red-400'}>
                {displaySqi}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
              <div
                className={`h-full transition-all duration-500 ${
                  displaySqi >= 80 ? 'bg-emerald-500' : displaySqi >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${displaySqi}%` }}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Metrics Grid */}
        <div className="grid grid-cols-2 gap-4">
          <MetricCard label="Heart Rate" value={displayVal(bpm ? Math.round(bpm) : null)} unit="BPM" />
          <MetricCard label="HRV" value={displayVal(hrv ? Math.round(hrv) : null)} unit="ms" />
          <MetricCard label="Resp Rate" value={displayVal(respRate ? Math.round(respRate) : null)} unit="BrPM" />
          <MetricCard label="Asymmetry" value={displayVal(asymmetry ? Math.round(asymmetry * 100) : null)} unit="%" />
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-gray-800 bg-black/40 p-4">
      <span className="text-sm font-medium text-gray-400">{label}</span>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-bold text-white">{value}</span>
        {value !== '--' && <span className="text-xs font-medium text-gray-500">{unit}</span>}
      </div>
    </div>
  );
}

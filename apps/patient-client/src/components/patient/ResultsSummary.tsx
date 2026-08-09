import type { FinalResults } from '../../hooks/useScanLifecycle';

interface ResultsSummaryProps {
  finalResults: FinalResults | null;
  lowConsistencyFlag: boolean;
  onRescan: () => void;
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function StatRow({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-line py-4 last:border-none">
      <span className="text-sm text-ink/55">{label}</span>
      <span className="font-display text-2xl tabular-nums text-ink">
        {value} <span className="text-sm font-sans text-ink/45">{unit}</span>
      </span>
    </div>
  );
}

/** Green checkmark — used for the success state. */
function SuccessIcon() {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-pulse-soft">
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#2F6F5E"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </div>
  );
}

/** Amber exclamation — used for soft failure states (motion / weak signal). */
function WarningIcon() {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#B45309"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </div>
  );
}

/** Grey question mark — used only for the unexpected null guard. */
function ErrorIcon() {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-line">
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#6B7280"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </div>
  );
}

function RescanButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full max-w-xs rounded-full border border-line py-3 text-[15px] font-medium text-ink/70 transition active:scale-[0.98]"
    >
      Scan again
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ResultsSummary({
  finalResults,
  lowConsistencyFlag,
  onRescan,
}: ResultsSummaryProps) {

  // ── State 1: unexpected null guard ───────────────────────────────────────
  if (finalResults === null) {
    return (
      <div className="flex flex-col items-center gap-6 px-6 py-8">
        <ErrorIcon />
        <div className="text-center">
          <h1 className="font-display text-2xl text-ink">Something went wrong</h1>
          <p className="mt-2 max-w-xs text-sm text-ink/55">
            We weren&apos;t able to process the scan. Please try again.
          </p>
        </div>
        <RescanButton onClick={onRescan} />
      </div>
    );
  }

  // ── State 2: all cycles rejected due to motion ────────────────────────────
  if (finalResults.allRejected) {
    return (
      <div className="flex flex-col items-center gap-6 px-6 py-8">
        <WarningIcon />
        <div className="text-center">
          <h1 className="font-display text-2xl text-ink">Too much movement</h1>
          <p className="mt-2 max-w-xs text-sm text-ink/55">
            The camera couldn&apos;t get a steady reading because of movement
            throughout the scan. Find a comfortable, still position and try
            again.
          </p>
        </div>
        <RescanButton onClick={onRescan} />
      </div>
    );
  }

  // ── State 3: weak / insufficient signal ───────────────────────────────────
  if (finalResults.weakSignal) {
    return (
      <div className="flex flex-col items-center gap-6 px-6 py-8">
        <WarningIcon />
        <div className="text-center">
          <h1 className="font-display text-2xl text-ink">Signal was too faint</h1>
          <p className="mt-2 max-w-xs text-sm text-ink/55">
            We didn&apos;t capture enough clear data. Try scanning in a
            brighter spot or moving a little closer to the camera.
          </p>
        </div>
        <RescanButton onClick={onRescan} />
      </div>
    );
  }

  // ── State 4: success ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-6 px-6 py-8">
      <SuccessIcon />

      <div className="text-center">
        <h1 className="font-display text-2xl text-ink">Sent to your care team</h1>
        <p className="mt-2 max-w-xs text-sm text-ink/55">
          Here&apos;s what we captured. Your doctor can see this now.
        </p>
      </div>

      <div className="w-full max-w-xs rounded-2xl border border-line bg-white/60 px-5">
        <StatRow
          label="Heart rate"
          value={Math.round(finalResults.bpm).toString()}
          unit="bpm"
        />
        <StatRow
          label="Heart rate variability"
          value={finalResults.hrvValid ? Math.round(finalResults.hrv).toString() : '--'}
          unit="ms"
        />
        {finalResults.respRate !== null && (
          <StatRow
            label="Respiratory rate"
            value={Math.round(finalResults.respRate).toString()}
            unit="br/min"
          />
        )}
      </div>

      {lowConsistencyFlag && (
        <p className="max-w-xs text-center text-[13px] leading-relaxed text-ink/50">
          Readings varied more than usual across cycles — consider rescanning
          for a more precise result.
        </p>
      )}

      <RescanButton onClick={onRescan} />
    </div>
  );
}

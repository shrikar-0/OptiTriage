import { useMemo } from 'react';

/**
 * PulseHalo — the signature visual element of the patient scan screen.
 *
 * A ring around the camera view that beats at the patient's own detected
 * heart rate once a valid BPM is available. Before that, it holds a slow,
 * neutral breathing cadence (4s) as a "waiting" idle state. This is not
 * decoration: it's the rPPG signal — literally a pulse — made visible to
 * the person it's being measured from.
 */
export default function PulseHalo({
  bpm,
  active,
}: {
  bpm: number | null;
  active: boolean;
}) {
  // Convert BPM into a CSS animation-duration. Fall back to a calm 4s
  // idle breathing rhythm when no valid signal exists yet.
  const durationMs = useMemo(() => {
    if (!active || !bpm || bpm <= 0) return 4000;
    return Math.round(60000 / bpm);
  }, [active, bpm]);

  return (
    <div
      className="pointer-events-none absolute inset-[-14px] rounded-[2.75rem]"
      style={{
        animation: `pulse-halo ${durationMs}ms ease-in-out infinite`,
        boxShadow: active
          ? '0 0 0 2px rgba(47,111,94,0.35)'
          : '0 0 0 2px rgba(27,36,32,0.12)',
      }}
    />
  );
}

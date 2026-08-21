import { useEffect, useRef } from 'react';
import { useCamera } from '../../hooks/useCamera';
import { useFaceMesh } from '../../hooks/useFaceMesh';
import { useRppgWorker } from '../../hooks/useRppgWorker';
import { useMotionWorker } from '../../hooks/useMotionWorker';
import { useScanLifecycle } from '../../hooks/useScanLifecycle';
import type { FinalResults } from '../../hooks/useScanLifecycle';
import { getGuidance, toneClasses } from '../../lib/guidance';
import PulseHalo from './PulseHalo';
import SignalBars from './SignalBars';



const CYCLE_DURATION_SEC = 20;
const TOTAL_CYCLES = 4;

interface ScanExperienceProps {
  onComplete: (result: { finalResults: FinalResults | null; lowConsistencyFlag: boolean }) => void;
}

export default function ScanExperience({ onComplete }: ScanExperienceProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { stream, error: cameraError, isInitializing } = useCamera();
  const { roiData } = useFaceMesh(videoRef);
  const { metrics } = useRppgWorker(videoRef.current, roiData);
  const { motionMetrics, diagSnapshot, lastProbeMessage } = useMotionWorker(videoRef, roiData, metrics?.sqi ?? 1.0);

  // Start scanning once a face is detected and there is at least a minimal signal.
  const startCondition = !!(roiData?.faceDetected && metrics && metrics.sqi >= 0.3);

  const { status, currentCycle, timeRemaining, finalResults, lowConsistencyFlag } =
    useScanLifecycle(metrics ?? null, motionMetrics ?? null, startCondition);

  // Fire onComplete exactly once when the lifecycle marks the scan done.
  const completedRef = useRef(false);
  useEffect(() => {
    if (status === 'complete' && !completedRef.current) {
      completedRef.current = true;
      onComplete({ finalResults, lowConsistencyFlag });
    }
  }, [status, finalResults, lowConsistencyFlag, onComplete]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Progress within the current 20-second cycle (0 → 1).
  const cycleProgress =
    status === 'scanning' ? (CYCLE_DURATION_SEC - timeRemaining) / CYCLE_DURATION_SEC : 0;

  // SQI is "low" when it exists but sits below the mid-cycle acceptance threshold.
  const sqiLow = metrics !== null && metrics !== undefined && metrics.sqi < 0.8;

  // Detect the render where currentCycle incremented so guidance can show
  // a brief "Cycle complete" confirmation before the new cycle settles.
  const prevCycleRef = useRef<number>(currentCycle);
  const cycleJustAdvanced =
    status === 'scanning' && currentCycle > 1 && prevCycleRef.current !== currentCycle;
  // Update the ref AFTER reading it for the comparison above.
  prevCycleRef.current = currentCycle;

  const guidance = getGuidance({
    faceDetected: !!roiData?.faceDetected,
    sqi: metrics?.sqi ?? null,
    hasValidMetrics: !!metrics?.valid,
    scanComplete: status === 'complete',
    status,
    currentCycle,
    sqiLow,
    cycleJustAdvanced,
  });

  if (isInitializing) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-sm text-ink/60">Turning on your camera…</p>
      </div>
    );
  }

  if (cameraError) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="font-display text-xl text-ink">Camera access needed</p>
        <p className="max-w-xs text-sm text-ink/60">
          Allow camera access in your browser to continue, then reload this
          page.
        </p>
      </div>
    );
  }

  const tone = toneClasses[guidance.tone];

  return (
    <div className="flex flex-col items-center gap-6 px-6 py-8">
      {/* ── Camera square ── */}
      <div className="relative aspect-square w-full max-w-[400px]">
        <PulseHalo bpm={metrics?.valid ? metrics.bpm : null} active={!!metrics?.valid} />

        <div className="absolute inset-3 overflow-hidden rounded-[2rem] bg-ink">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full scale-x-[-1] object-cover"
          />
        </div>
      </div>

      {/* ── Progress bar + cycle indicator ── */}
      <div className="flex w-full max-w-[400px] flex-col items-center gap-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-pulse"
            style={{
              width: `${cycleProgress * 100}%`,
              transition: 'width 1s linear',
            }}
          />
        </div>
        {status === 'scanning' && (
          <p className="text-xs font-medium text-ink/60">
            Cycle {currentCycle} of {TOTAL_CYCLES} &mdash; {Math.max(timeRemaining, 0)}s remaining
          </p>
        )}
      </div>

      {/* ── Guidance text ── */}
      <div className="flex flex-col items-center gap-1.5 text-center">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
          <p className={`font-display text-lg ${tone.text}`}>{guidance.headline}</p>
        </div>
        <p className="max-w-[240px] text-[13px] leading-relaxed text-ink/55">{guidance.detail}</p>
        <SignalBars active={metrics?.valid ?? false} />
      </div>
    </div>
  );
}

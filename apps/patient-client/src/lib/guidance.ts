/**
 * Translates raw pipeline state (face detection, SQI, buffering) into
 * calm, plain-language guidance for the patient. No jargon, no numbers —
 * those live in the debug overlay, not here.
 */

export type GuidanceTone = 'wait' | 'fix' | 'good' | 'done';

export interface Guidance {
  tone: GuidanceTone;
  headline: string;
  detail: string;
}

export function getGuidance(params: {
  faceDetected: boolean;
  sqi: number | null;
  hasValidMetrics: boolean;
  scanComplete: boolean;
  /** Current scan status from useScanLifecycle */
  status?: 'idle' | 'scanning' | 'complete';
  /** Which cycle we are in (1-based), from useScanLifecycle */
  currentCycle?: number;
  /** True when live SQI has dropped below the cycle-acceptance threshold */
  sqiLow?: boolean;
  /**
   * True for exactly the render in which currentCycle just incremented.
   * ScanExperience computes this via a usePrevious comparison and passes it in
   * so guidance can show a brief "Cycle complete" confirmation message.
   */
  cycleJustAdvanced?: boolean;
}): Guidance {
  const {
    faceDetected,
    sqi,
    hasValidMetrics,
    scanComplete,
    status,
    currentCycle,
    sqiLow,
    cycleJustAdvanced,
  } = params;

  if (scanComplete || status === 'complete') {
    return {
      tone: 'done',
      headline: 'Scan complete',
      detail: 'Preparing your results.',
    };
  }

  if (!faceDetected) {
    return {
      tone: 'wait',
      headline: 'Find your position',
      detail: 'Center your face in the frame, about an arm\u2019s length from the camera.',
    };
  }

  if (sqi !== null && sqi < 0.3) {
    return {
      tone: 'fix',
      headline: 'Hold still',
      detail: 'Small movements are making the reading noisy. Rest your head and relax your shoulders.',
    };
  }

  // Cycle-just-advanced: brief confirmation on the render where currentCycle
  // incremented. Has priority over the generic between-cycle wait copy.
  if (cycleJustAdvanced) {
    return {
      tone: 'good',
      headline: 'Cycle complete',
      detail: 'Starting the next reading — stay in position.',
    };
  }

  // Between-cycle transition: new cycle about to start
  if (status === 'scanning' && currentCycle !== undefined && currentCycle > 1 && !hasValidMetrics) {
    return {
      tone: 'wait',
      headline: `Cycle ${currentCycle} starting — stay still`,
      detail: 'Hold your position while we capture the next reading.',
    };
  }

  // Scanning with low signal quality mid-cycle
  if (status === 'scanning' && sqiLow) {
    return {
      tone: 'fix',
      headline: 'Signal a bit noisy',
      detail: 'Try to stay very still and keep your face fully lit.',
    };
  }

  if (hasValidMetrics) {
    return {
      tone: 'good',
      headline: 'Reading steady',
      detail: 'Stay just like this. Breathe normally.',
    };
  }

  return {
    tone: 'wait',
    headline: 'Getting a signal',
    detail: 'This takes a few seconds. No need to hold your breath.',
  };
}

export const toneClasses: Record<GuidanceTone, { text: string; dot: string }> = {
  wait: { text: 'text-ink/60', dot: 'bg-ink/30' },
  fix: { text: 'text-coral', dot: 'bg-coral' },
  good: { text: 'text-pulse', dot: 'bg-pulse' },
  done: { text: 'text-pulse', dot: 'bg-pulse' },
};

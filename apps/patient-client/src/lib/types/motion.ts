import type { MotionRoi } from './roi';

export interface RrDiagSnapshot {
  effectiveFps: string;
  torsoPointsTracked: number;
  rawBufferLength: number;
  filteredBufferLength: number;
  bufferSeconds: string;
  isBufferFull: boolean;
  sampleCount?: number;
  fftResolutionHz?: string;
  timestampDtMin?: string;
  timestampDtMax?: string;
  timestampDtMean?: string;
  timestampDtStd?: string;
  bandPower?: string;
  respRms: string;
  respPeakToPeak: string;
  peakFrequency: string;
  instantRR: number;
  rawRR: number;
  smoothedRR: number;
  peakPowerRatio: string;
  signalQuality: string;
  finalValid: boolean;
  diagnosticClassification: string;
  rejectionReason: string;
  lastProbeMessage: string;
}

/**
 * Numeric output of the motion-lane worker.
 *
 * Naming follows the OptiTriage claims-discipline rule: all field names use
 * screening / flag language, not diagnostic language.
 */
export interface MotionMetrics {
  /**
   * Estimated respiratory rate in breaths-per-minute, derived from the
   * low-frequency vertical displacement of the torso/shoulder ROI.
   * 0 when `valid` is false or the buffer is still filling.
   */
  respRate: number;

  /**
   * A 5-element normalised feature vector derived from per-landmark optical
   * flow across the facial landmark grid.
   *
   * Layout:
   *   [0] leftMeanDx   – mean horizontal flow on the left facial half
   *   [1] leftMeanDy   – mean vertical flow on the left facial half
   *   [2] rightMeanDx  – mean horizontal flow on the right facial half
   *   [3] rightMeanDy  – mean vertical flow on the right facial half
   *   [4] asymmetryMagnitude – |leftFlow − rightFlow| (normalised [0, 1])
   *
   * Values are unitless scalars; magnitude is in the [0, 1] range after
   * per-window normalisation.
   */
  motionAsymmetryFlag: [number, number, number, number, number];

  /** True only when the SQI gate passes AND the displacement buffer is full. */
  valid: boolean;

  /** performance.now() timestamp of the source frame. */
  timestamp: number;

  /** Diagnostic snapshot payload for real-time mobile display */
  diagSnapshot?: RrDiagSnapshot;
}

// ---------------------------------------------------------------------------
// Worker message types
// ---------------------------------------------------------------------------

export type MotionWorkerMessageIn =
  | {
      type: 'PROCESS_FRAME';
      /** Transferred (zero-copy) — will be neutered on the sending side. */
      bitmap: ImageBitmap;
      motionRoi: MotionRoi;
      /**
       * Signal Quality Index forwarded from the rPPG worker output so both
       * lanes share the same gate.  Value is in [0, 1].
       */
      sqi: number;
      timestamp: number;
    }
  | { type: 'DESTROY' };

export type MotionWorkerMessageOut =
  | { type: 'LOADING' }
  | { type: 'READY' }
  | { type: 'METRICS'; payload: MotionMetrics }
  | { type: 'ERROR'; error: string }
  | { type: 'DESTROY_ACK' };

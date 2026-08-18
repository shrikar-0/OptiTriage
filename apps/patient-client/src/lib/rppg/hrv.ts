/**
 * Time-domain Heart Rate Variability (HRV) estimator.
 *
 * Algorithm
 * ─────────
 * 1. Receive the 10-second CHROM signal array and a matching timestamp array.
 * 2. Normalize the signal to [0, 1].
 * 3. Detect systolic peaks via adaptive moving-average threshold + local-max
 *    confirmation with a minimum physiological refractory period (333 ms,
 *    equivalent to 180 BPM).
 * 4. Extract inter-beat intervals (IBIs, also called R-R intervals) in ms.
 * 5. Gate IBIs: keep only intervals in [333 ms, 1500 ms] (40–180 BPM).
 * 6. Reject ectopic / missed-beat artefacts: discard IBIs that deviate more
 *    than 20% from the local median of the last 5 valid intervals.
 * 7. Require ≥ MIN_VALID_IBIS consecutive valid IBIs before computing HRV.
 * 8. Compute RMSSD:
 *      RMSSD = sqrt( (1/N) * Σ (IBI[i+1] − IBI[i])² )   for N pairs
 * 9. Compute SDNN:
 *      SDNN  = std( validIBIs )
 *
 * The caller provides an SQI value; if SQI < MIN_SQI the result is
 * marked invalid with reason 'POOR_SIGNAL_QUALITY'.
 *
 * All thresholds are exported constants so callers can reference them without
 * magic numbers.
 */

/** IBI must be ≥ this value (ms) — corresponds to the 180 BPM upper limit */
export const IBI_MIN_MS = 333;
/** IBI must be ≤ this value (ms) — corresponds to the 40 BPM lower limit */
export const IBI_MAX_MS = 1500;
/** Maximum relative deviation from the local-median IBI to be kept as normal */
export const ECTOPIC_RELATIVE_THRESHOLD = 0.20;
/** Minimum number of valid consecutive IBIs required to compute HRV */
export const MIN_VALID_IBIS = 5;
/** Minimum SQI (0–1) required to declare HRV valid */
export const MIN_HRV_SQI = 0.50;
/**
 * Moving-average window (in samples) used to compute the adaptive peak-
 * detection threshold.  At 30 FPS this is a 1-second window; at 60 FPS it is
 * 0.5 seconds — both sit safely inside one cardiac cycle.
 */
/** Preferred moving-average window duration (seconds) used to compute the
 * adaptive peak-detection threshold.  We convert this to samples using the
 * measured effective sample rate for the provided timestamp array so that
 * the detector behaves consistently across variable frame rates.
 */
const PEAK_WINDOW_SEC = 0.8; // within 0.75–1.0s as requested

// Safety clamps for the computed window in samples to avoid pathological
// behaviour on highly irregular timestamps or extremely low sample counts.
const MIN_PEAK_WINDOW_SAMPLES = 8;
const MAX_PEAK_WINDOW_SAMPLES = 1024;

export type HrvRejectionReason =
  | 'INSUFFICIENT_DATA'
  | 'POOR_SIGNAL_QUALITY'
  | 'INSUFFICIENT_VALID_BEATS'
  | 'INSUFFICIENT_VALID_IBIS'
  | 'LOW_FRAME_RATE'
  | 'UNSTABLE_BEAT_TIMING'
  | 'NONE';

/** Minimum sample rate (Hz) required to produce a valid HRV estimate */
export const MIN_HRV_SAMPLE_RATE_HZ = 15;

/** Maximum allowed fraction of physiological IBIs rejected by ectopic filter (>35%) */
export const MAX_ECTOPIC_REJECTION_RATIO = 0.35;

export interface IbiEntry {
  ibiMs: number;
  prevPeakIdx: number;
  nextPeakIdx: number;
  prevPeakTs: number;
  nextPeakTs: number;
  isPhysiological: boolean;
  isAccepted: boolean;
}

export interface HrvResult {
  /** Root-mean-square of successive IBI differences (ms). 0 when not valid. */
  rmssd: number;
  /** Standard deviation of all valid IBIs (ms). 0 when not valid. */
  sdnn: number;
  /** True when a reliable HRV estimate was produced. */
  hrvValid: boolean;
  /** Human-readable reason for rejection, 'NONE' on success. */
  rejectionReason: HrvRejectionReason;
  /** Signal quality index supplied by the caller. */
  signalQuality: number;
  /** Heart rate (BPM) implied by the mean of valid IBIs. */
  heartRateFromIbi: number;
  /** Number of candidate peaks detected. */
  detectedBeats: number;
  /** Number of valid IBI intervals (after physiology + ectopic gating). */
  validIBIs: number;
  /** Number of IBIs rejected by physiology or ectopic gate. */
  rejectedIBIs: number;
  /** Mean of valid IBIs (ms). 0 when not valid. */
  meanIBI: number;
  /** Minimum of valid IBIs (ms). 0 when not valid. */
  minIBI: number;
  /** Maximum of valid IBIs (ms). 0 when not valid. */
  maxIBI: number;
  /** The extracted raw IBI array (ms), gated but not ectopic-filtered.
   *  Exposed for diagnostic logging. */
  rawIBIsMs: number[];
  /** The final accepted IBI array (ms) after all gates. */
  validIBIsMs: number[];
  // Optional diagnostics (temporary): signal and peak details for debugging
  diag?: {
    signalLength: number;
    windowDurationMs: number;
    effectiveSampleRateHz: number;
    sigMin: number;
    sigMax: number;
    sigMean: number;
    sigStd: number;
    sigRms: number;
    minRefractorySamples: number;
    candidatePeaks: number[]; // indices
    acceptedPeaks: number[]; // indices
    peakAmplitudes: number[];
    detectedBeatIndices?: number[];
    detectedBeatTimestamps?: number[];
    rawIBIsMs?: number[];
    physiologicalIBIsMs?: number[];
    validIBIsMs?: number[];
    rejectedIBIsMs?: number[];
    deltaIBIs?: number[];
    ibiStd?: number;
    maxAbsDeltaIbi?: number;
    rmssdValuesUsed?: number[];
  };
}

/** Returned when there is not enough input signal to attempt analysis. */
const INSUFFICIENT_RESULT: HrvResult = {
  rmssd: 0,
  sdnn: 0,
  hrvValid: false,
  rejectionReason: 'INSUFFICIENT_DATA',
  signalQuality: 0,
  heartRateFromIbi: 0,
  detectedBeats: 0,
  validIBIs: 0,
  rejectedIBIs: 0,
  meanIBI: 0,
  minIBI: 0,
  maxIBI: 0,
  rawIBIsMs: [],
  validIBIsMs: [],
};

export class HrvEstimator {
  /**
   * Analyze a CHROM pulse signal and its per-sample timestamps to extract
   * beat-to-beat intervals and compute RMSSD / SDNN.
   *
   * @param signal      The 1-D CHROM pulse signal (e.g. 300 samples at 30 FPS).
   * @param timestamps  Monotonic timestamps in ms, one per signal sample.
   *                    Must be the same length as `signal`.
   * @param sqi         Signal quality index from the SQI engine (0–1).
   * @returns           A fully-populated `HrvResult` object.
   */
  static analyze(signal: number[], timestamps: number[], sqi: number): HrvResult {
    // ── 0. Guards & compute time-aware parameters ─────────────────────────────
    if (timestamps.length !== signal.length || timestamps.length < 2) {
      return { ...INSUFFICIENT_RESULT };
    }

    const bufferDurationMs = timestamps[timestamps.length - 1] - timestamps[0];
    if (bufferDurationMs <= 0) return { ...INSUFFICIENT_RESULT };

    const samplesPerMs = (signal.length - 1) / bufferDurationMs;
    const samplesPerSec = samplesPerMs * 1000;

    // Compute preferred window in samples from desired seconds and clamp
    let windowSamples = Math.round(PEAK_WINDOW_SEC * samplesPerSec);
    if (windowSamples < MIN_PEAK_WINDOW_SAMPLES) windowSamples = MIN_PEAK_WINDOW_SAMPLES;
    if (windowSamples > MAX_PEAK_WINDOW_SAMPLES) windowSamples = MAX_PEAK_WINDOW_SAMPLES;

    if (signal.length < 2 * windowSamples) {
      const diagShort = {
        signalLength: signal.length,
        windowDurationMs: (windowSamples / samplesPerSec) * 1000,
        effectiveSampleRateHz: samplesPerSec,
        sigMin: 0,
        sigMax: 0,
        sigMean: 0,
        sigStd: 0,
        sigRms: 0,
        minRefractorySamples: Math.max(3, Math.floor(IBI_MIN_MS * samplesPerMs)),
        candidatePeaks: [],
        acceptedPeaks: [],
        peakAmplitudes: [],
      };
      return { ...INSUFFICIENT_RESULT, diag: diagShort };
    }

    // ── 1. Normalize signal to [0, 1] ─────────────────────────────────────────
    let sigMin = Infinity;
    let sigMax = -Infinity;
    for (const v of signal) {
      if (v < sigMin) sigMin = v;
      if (v > sigMax) sigMax = v;
    }
    const sigRange = sigMax - sigMin;
    if (sigRange < 1e-9) {
      console.warn('[HRV] Flat signal detected: sigRange=', sigRange, 'len=', signal.length);
      return { ...INSUFFICIENT_RESULT };
    }
    const norm = signal.map((v) => (v - sigMin) / sigRange);

    // ── 2. Adaptive peak detection & 3-point parabolic sub-sample interpolation ──────────────
    const movAvg = new Float64Array(norm.length);
    for (let i = 0; i < norm.length; i++) {
      const half = Math.floor(windowSamples / 2);
      const lo = Math.max(0, i - half);
      const hi = Math.min(norm.length - 1, i + half);
      let sum = 0;
      for (let j = lo; j <= hi; j++) sum += norm[j];
      movAvg[i] = sum / (hi - lo + 1);
    }

    const minRefractorySamples = Math.max(3, Math.floor(IBI_MIN_MS * samplesPerMs));

    const sigMean = signal.reduce((a, b) => a + b, 0) / signal.length;
    const sigStd = Math.sqrt(signal.reduce((acc, v) => acc + (v - sigMean) ** 2, 0) / signal.length);
    const sigRms = Math.sqrt(signal.reduce((acc, v) => acc + v * v, 0) / signal.length);

    const candidatePeaks: number[] = [];
    for (let i = 1; i < norm.length - 1; i++) {
      const isLocalMax = norm[i] > norm[i - 1] && norm[i] >= norm[i + 1];
      const aboveThreshold = norm[i] > movAvg[i];
      if (isLocalMax && aboveThreshold) candidatePeaks.push(i);
    }

    const peakIndices: number[] = [];
    const peakTimestamps: number[] = [];
    let lastPeakIdx = -minRefractorySamples;

    for (let i = 1; i < norm.length - 1; i++) {
      const isLocalMax = norm[i] > norm[i - 1] && norm[i] >= norm[i + 1];
      const aboveThreshold = norm[i] > movAvg[i];
      const pastRefractory = i - lastPeakIdx >= minRefractorySamples;

      if (isLocalMax && aboveThreshold && pastRefractory) {
        peakIndices.push(i);
        lastPeakIdx = i;

        // Phase 4: 3-point parabolic sub-sample peak interpolation
        let refinedTs = timestamps[i];
        const alpha = norm[i - 1];
        const beta = norm[i];
        const gamma = norm[i + 1];
        const denom = alpha - 2 * beta + gamma;

        if (Math.abs(denom) > 1e-9) {
          let delta = (0.5 * (alpha - gamma)) / denom;
          if (Number.isNaN(delta) || !Number.isFinite(delta)) delta = 0;
          if (delta > 0.5) delta = 0.5;
          if (delta < -0.5) delta = -0.5;

          if (delta > 0 && i < timestamps.length - 1) {
            refinedTs = timestamps[i] + delta * (timestamps[i + 1] - timestamps[i]);
          } else if (delta < 0 && i > 0) {
            refinedTs = timestamps[i] + delta * (timestamps[i] - timestamps[i - 1]);
          }
        }
        peakTimestamps.push(refinedTs);
      }
    }

    const acceptedPeaks = [...peakIndices];
    const peakAmplitudes = acceptedPeaks.map((idx) => norm[idx]);

    const diagObj = {
      signalLength: signal.length,
      windowDurationMs: (windowSamples / samplesPerSec) * 1000,
      effectiveSampleRateHz: samplesPerSec,
      sigMin,
      sigMax,
      sigMean,
      sigStd,
      sigRms,
      minRefractorySamples,
      candidatePeaks,
      acceptedPeaks,
      peakAmplitudes,
      rejectedPeakCount: Math.max(0, candidatePeaks.length - acceptedPeaks.length),
    };

    const detectedBeats = peakIndices.length;

    // ── 3. Extract raw IBIs with full provenance ──────────────────────────────
    const rawIbiEntries: IbiEntry[] = [];
    for (let i = 1; i < peakIndices.length; i++) {
      const prevIdx = peakIndices[i - 1];
      const nextIdx = peakIndices[i];
      const prevTs = peakTimestamps[i - 1];
      const nextTs = peakTimestamps[i];
      const ibiMs = nextTs - prevTs;
      const isPhysiological = ibiMs >= IBI_MIN_MS && ibiMs <= IBI_MAX_MS;

      rawIbiEntries.push({
        ibiMs,
        prevPeakIdx: prevIdx,
        nextPeakIdx: nextIdx,
        prevPeakTs: prevTs,
        nextPeakTs: nextTs,
        isPhysiological,
        isAccepted: false,
      });
    }

    const rawIBIsMs: number[] = rawIbiEntries.map((e) => e.ibiMs);
    const physiologicalEntries = rawIbiEntries.filter((e) => e.isPhysiological);
    const physiologicalIBIs = physiologicalEntries.map((e) => e.ibiMs);

    // ── 4 & 5. Ectopic / artifact gate with robust cold-start handling ─────────────
    const validIbiEntries = applyEctopicFilterEntries(physiologicalEntries);
    const validIBIsMs = validIbiEntries.map((e) => e.ibiMs);

    const rejectedIBIsMs = rawIBIsMs.filter((ibi) => !validIBIsMs.includes(ibi));
    const rejectedIBIs = rejectedIBIsMs.length;

    // ── 5.5. Gate Priority 1: Frame Rate Quality Gate ────────────────────────
    if (samplesPerSec < MIN_HRV_SAMPLE_RATE_HZ) {
      return {
        rmssd: 0,
        sdnn: 0,
        hrvValid: false,
        rejectionReason: 'LOW_FRAME_RATE',
        signalQuality: sqi,
        heartRateFromIbi: 0,
        detectedBeats,
        validIBIs: validIBIsMs.length,
        rejectedIBIs,
        meanIBI: 0,
        minIBI: 0,
        maxIBI: 0,
        rawIBIsMs,
        validIBIsMs,
        diag: diagObj,
      };
    }

    // ── 6. Gate Priority 2: SQI Quality Gate ─────────────────────────────────
    if (sqi < MIN_HRV_SQI) {
      return {
        rmssd: 0,
        sdnn: 0,
        hrvValid: false,
        rejectionReason: 'POOR_SIGNAL_QUALITY',
        signalQuality: sqi,
        heartRateFromIbi: 0,
        detectedBeats,
        validIBIs: validIBIsMs.length,
        rejectedIBIs,
        meanIBI: 0,
        minIBI: 0,
        maxIBI: 0,
        rawIBIsMs,
        validIBIsMs,
        diag: diagObj,
      };
    }

    // ── 7. Gate Priority 3: Minimum Valid IBIs Gate ─────────────────────────
    if (validIBIsMs.length < MIN_VALID_IBIS) {
      const reason: HrvRejectionReason =
        detectedBeats < 2
          ? 'INSUFFICIENT_VALID_BEATS'
          : 'INSUFFICIENT_VALID_IBIS';
      return {
        rmssd: 0,
        sdnn: 0,
        hrvValid: false,
        rejectionReason: reason,
        signalQuality: sqi,
        heartRateFromIbi: 0,
        detectedBeats,
        validIBIs: validIBIsMs.length,
        rejectedIBIs,
        meanIBI: 0,
        minIBI: 0,
        maxIBI: 0,
        rawIBIsMs,
        validIBIsMs,
        diag: diagObj,
      };
    }

    // ── 7.5. Gate Priority 4: Unstable Beat Timing Gate (>35% Ectopic Rejection) ──
    const physCount = physiologicalEntries.length;
    const ectopicRejectedCount = physCount - validIBIsMs.length;
    const ectopicRejectionRatio = physCount > 0 ? ectopicRejectedCount / physCount : 0;

    if (physCount >= MIN_VALID_IBIS && ectopicRejectionRatio > MAX_ECTOPIC_REJECTION_RATIO) {
      return {
        rmssd: 0,
        sdnn: 0,
        hrvValid: false,
        rejectionReason: 'UNSTABLE_BEAT_TIMING',
        signalQuality: sqi,
        heartRateFromIbi: 0,
        detectedBeats,
        validIBIs: validIBIsMs.length,
        rejectedIBIs,
        meanIBI: 0,
        minIBI: 0,
        maxIBI: 0,
        rawIBIsMs,
        validIBIsMs,
        diag: diagObj,
      };
    }

    // ── 8. Compute time-domain HRV metrics with strict consecutiveness ───────
    const n = validIBIsMs.length;
    const meanIBI = validIBIsMs.reduce((a, b) => a + b, 0) / n;
    const minIBI = Math.min(...validIBIsMs);
    const maxIBI = Math.max(...validIBIsMs);

    // Phase 1: Strictly consecutive RMSSD diff calculation
    const deltaIBIs: number[] = [];
    const rmssdValuesUsed: number[] = [];

    for (let i = 1; i < validIbiEntries.length; i++) {
      const prevEntry = validIbiEntries[i - 1];
      const currEntry = validIbiEntries[i];

      // Two accepted IBIs represent consecutive cardiac intervals IF AND ONLY IF
      // the ending beat index of prevEntry matches the starting beat index of currEntry.
      const isConsecutive = currEntry.prevPeakIdx === prevEntry.nextPeakIdx;

      if (isConsecutive) {
        const diff = currEntry.ibiMs - prevEntry.ibiMs;
        deltaIBIs.push(diff);
        rmssdValuesUsed.push(diff * diff);
      }
    }

    const ibiStd = n > 0 ? Math.sqrt(validIBIsMs.reduce((acc, v) => acc + (v - meanIBI) ** 2, 0) / n) : 0;
    const maxAbsDeltaIbi = deltaIBIs.length > 0 ? Math.max(...deltaIBIs.map((d) => Math.abs(d))) : 0;

    // SDNN — standard deviation of all valid NN intervals
    const varianceSum = validIBIsMs.reduce((acc, ibi) => acc + (ibi - meanIBI) ** 2, 0);
    const sdnn = Math.sqrt(varianceSum / n);

    // RMSSD — root-mean-square of successive CONSECUTIVE differences
    const rmssd = rmssdValuesUsed.length > 0
      ? Math.sqrt(rmssdValuesUsed.reduce((a, b) => a + b, 0) / rmssdValuesUsed.length)
      : 0;

    const heartRateFromIbi = meanIBI > 0 ? 60000 / meanIBI : 0;

    return {
      rmssd: Number(rmssd.toFixed(1)),
      sdnn: Number(sdnn.toFixed(1)),
      hrvValid: true,
      rejectionReason: 'NONE',
      signalQuality: sqi,
      heartRateFromIbi: Number(heartRateFromIbi.toFixed(1)),
      detectedBeats,
      validIBIs: n,
      rejectedIBIs,
      meanIBI: Number(meanIBI.toFixed(1)),
      minIBI: Number(minIBI.toFixed(1)),
      maxIBI: Number(maxIBI.toFixed(1)),
      rawIBIsMs,
      validIBIsMs,
      diag: {
        ...diagObj,
        detectedBeatIndices: peakIndices,
        detectedBeatTimestamps: peakTimestamps,
        rawIBIsMs,
        physiologicalIBIsMs: physiologicalIBIs,
        validIBIsMs,
        rejectedIBIsMs,
        deltaIBIs,
        ibiStd,
        maxAbsDeltaIbi,
        rmssdValuesUsed,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Removes IBI entries that deviate by more than ECTOPIC_RELATIVE_THRESHOLD
 * from the running median of valid values. Uses initial window median for cold start.
 */
function applyEctopicFilterEntries(entries: IbiEntry[]): IbiEntry[] {
  const MEDIAN_WINDOW = 5;
  const accepted: IbiEntry[] = [];

  if (entries.length === 0) return [];

  // Phase 2: Compute initial window median from initial physiological IBIs (up to 5)
  const initialSlice = entries.slice(0, Math.min(5, entries.length)).map((e) => e.ibiMs).sort((a, b) => a - b);
  const midIdx = Math.floor(initialSlice.length / 2);
  const initialWindowMedian = initialSlice.length % 2 === 1
    ? initialSlice[midIdx]
    : (initialSlice[midIdx - 1] + initialSlice[midIdx]) / 2;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const ibi = entry.ibiMs;

    let localMedian = initialWindowMedian;
    if (accepted.length >= 2) {
      const window = accepted.slice(-MEDIAN_WINDOW).map((e) => e.ibiMs);
      const sorted = [...window].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      localMedian = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    const relDeviation = Math.abs(ibi - localMedian) / localMedian;
    if (relDeviation <= ECTOPIC_RELATIVE_THRESHOLD) {
      entry.isAccepted = true;
      accepted.push(entry);
    } else {
      entry.isAccepted = false;
    }
  }

  return accepted;
}

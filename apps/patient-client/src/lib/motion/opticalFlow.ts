/**
 * Pure-math helpers for the motion-lane optical flow analysis.
 *
 * This module is intentionally free of any OpenCV.js dependency so it can be
 * unit-tested in a plain Node environment.  The OpenCV.js calls live entirely
 * inside motion.worker.ts.
 */

import FFT from 'fft.js';
import { ButterworthBandpass } from './butterworth';

// ---------------------------------------------------------------------------
// Respiratory rate from shoulder / torso vertical displacement
// ---------------------------------------------------------------------------

/**
 * Physiological respiratory-rate band: 8 – 30 breaths per minute.
 * Lower edge raised from 0.1 Hz (6 brpm) to 0.133 Hz (8 brpm) to exclude
 * very-low-frequency motion noise while still covering bradypnoeic adults.
 * Upper edge kept at 0.5 Hz (30 brpm) to cover tachypnoeic states.
 */
const RESP_LO_HZ = 0.133; // 8 brpm  — tighter than the old 0.1 Hz / 6 brpm
const RESP_HI_HZ = 0.5;   // 30 brpm

/** Minimum RMS amplitude of filtered signal required to declare valid respiration (above noise floor). */
export const MIN_RESP_RMS = 0.010;
/** Minimum peak-to-peak amplitude of filtered signal required to declare valid respiration. */
export const MIN_RESP_P2P = 0.040;
/** Minimum ratio of peak spectral power to total band power in 0.133–0.5 Hz. */
export const MIN_PEAK_POWER_RATIO = 0.050;

/** Rolling buffer target window in seconds for resp-rate estimation. */
const TARGET_WINDOW_SEC = 10.0;
/** Hard cap on max buffer length to ensure bounded memory at high FPS (e.g. 60 FPS = 600 frames). */
const MAX_BUFFER_CAPACITY = 600;

/**
 * How many successive RR estimates to average for the smoothed output.
 * At ~1 estimate per second (once buffer is full) this yields a ~12-second
 * rolling window — long enough to damp single-frame outliers but short
 * enough to track a genuine rate change within 15 s.
 */
const RR_SMOOTH_WINDOW = 12;

export interface SpectralPeak {
  freqHz: number;
  bpm: number;
  power: number;
  ratio: number;
  rank: number;
}

export type DiagnosticClassification =
  | 'STABLE_RESPIRATORY_PEAK'
  | 'PEAK_SWITCH'
  | 'POSSIBLE_HARMONIC'
  | 'MULTIPLE_COMPETING_PEAKS'
  | 'NO_STABLE_PEAK';

export interface SpectralStats {
  rms: number;
  p2p: number;
  variance: number;
  peakFrequency: number;
  peakPower: number;
  bandPower: number;
  peakPowerRatio: number;
  signalQuality: 'LOW' | 'MEDIUM' | 'HIGH';
  isValid: boolean;
  rr: number;
  zeroCrossings: number;
  bufferSeconds: number;
  sampleCount: number;
  fftResolutionHz: number;
  topPeaks?: SpectralPeak[];
  selectedPeakRank?: number;

  // Diagnostic stability & harmonic analysis (observation only)
  previousSelectedFreqHz?: number;
  currentSelectedFreqHz?: number;
  frequencyDeltaHz?: number;
  previousSelectedBpm?: number;
  currentSelectedBpm?: number;
  frequencyJumpBpm?: number;

  isPossibleHarmonic?: boolean;
  harmonicRatio?: number;
  fundamentalCandidateBpm?: number;
  diagnosticClassification?: DiagnosticClassification;

  // Resampling diagnostics
  originalSampleCount?: number;
  originalEffectiveFps?: number;
  dtMeanMs?: number;
  dtStdMs?: number;
  resampledSampleCount?: number;
  resampledFps?: number;
}

export interface ResampledSignalResult {
  signal: number[];
  targetFs: number;
  originalEffectiveFps: number;
  dtMeanMs: number;
  dtStdMs: number;
  originalCount: number;
  resampledCount: number;
  hasGap: boolean;
}

/**
 * Resamples an irregularly sampled signal onto a uniform time grid using linear interpolation.
 *
 * @param signal      Original 1D signal values.
 * @param timestamps  Original monotonic timestamps in milliseconds.
 * @param overrideTargetFs Optional target sample rate in Hz. If omitted, uses max(15, round(originalEffectiveFps)).
 */
export function resampleSignalUniformly(
  signal: number[],
  timestamps: number[],
  overrideTargetFs?: number
): ResampledSignalResult | null {
  if (signal.length < 2 || timestamps.length !== signal.length) {
    return null;
  }

  const tStart = timestamps[0];
  const tEnd = timestamps[timestamps.length - 1];
  const durationMs = tEnd - tStart;

  if (durationMs <= 0) {
    return null;
  }

  const durationSec = durationMs / 1000;
  const originalEffectiveFps = (timestamps.length - 1) / durationSec;

  const dtsMs: number[] = [];
  let sumDtMs = 0;
  let sumSqDtMs = 0;
  let hasGap = false;

  for (let i = 1; i < timestamps.length; i++) {
    const dt = timestamps[i] - timestamps[i - 1];
    dtsMs.push(dt);
    sumDtMs += dt;
    sumSqDtMs += dt * dt;
    if (dt > 2000) {
      hasGap = true;
    }
  }

  const dtMeanMs = sumDtMs / dtsMs.length;
  const varianceMs = dtsMs.length > 1 ? Math.max(0, sumSqDtMs / dtsMs.length - dtMeanMs * dtMeanMs) : 0;
  const dtStdMs = Math.sqrt(varianceMs);

  const targetFs = overrideTargetFs && overrideTargetFs > 0
    ? overrideTargetFs
    : 30;

  const dtGridMs = 1000 / targetFs;
  const resampledSignal: number[] = [];

  let origIdx = 0;
  for (let tGrid = tStart; tGrid <= tEnd; tGrid += dtGridMs) {
    while (origIdx < timestamps.length - 2 && timestamps[origIdx + 1] < tGrid) {
      origIdx++;
    }

    const t0 = timestamps[origIdx];
    const t1 = timestamps[origIdx + 1];
    const dtSeg = t1 - t0;

    if (dtSeg <= 0 || tGrid <= t0) {
      resampledSignal.push(signal[origIdx]);
    } else if (tGrid >= t1) {
      resampledSignal.push(signal[origIdx + 1]);
    } else {
      const alpha = (tGrid - t0) / dtSeg;
      const interpVal = (1 - alpha) * signal[origIdx] + alpha * signal[origIdx + 1];
      resampledSignal.push(interpVal);
    }
  }

  return {
    signal: resampledSignal,
    targetFs,
    originalEffectiveFps,
    dtMeanMs,
    dtStdMs,
    originalCount: signal.length,
    resampledCount: resampledSignal.length,
    hasGap,
  };
}

/**
 * Maintains state for respiratory rate extraction.
 *
 * The caller feeds one scalar (mean vertical displacement across the torso
 * optical flow) per frame.  When the buffer is full, `getRespRate()` returns
 * the dominant frequency in the respiratory band.
 */
export class RespiratoryRateEstimator {
  private readonly filter: ButterworthBandpass;
  private readonly rawBuffer: number[] = [];
  private readonly filteredBuffer: number[] = [];
  private readonly timestampsBuffer: number[] = [];
  /** Effective sample rate in Hz (updated on each push). */
  private effectiveFps = 30;
  private lastTimestamp = -1;

  /**
   * Rolling window of recent instantaneous RR estimates (brpm).
   * Used to compute the smoothed (rolling-average) output.
   */
  private readonly rrHistory: number[] = [];

  /**
   * Diagnostic-only: the selected peak frequency from the previous
   * computeSpectralStats() call.  Used to detect peak switching between
   * consecutive 1-second snapshots.  Never influences production output.
   */
  private diagPrevSelectedFreqHz: number | null = null;

  constructor() {
    this.filter = new ButterworthBandpass(RESP_LO_HZ, RESP_HI_HZ, 30);
  }

  /**
   * Push one vertical-displacement scalar and the current timestamp.
   *
   * @param dy        Mean vertical flow (pixels, positive = downward)
   * @param timestamp performance.now() of the source frame
   */
  push(dy: number, timestamp?: number): void {
    const now = typeof timestamp === 'number' ? timestamp : (typeof performance !== 'undefined' ? performance.now() : Date.now());

    // Update effective FPS estimate using a running delta
    if (this.lastTimestamp >= 0) {
      const dt = (now - this.lastTimestamp) / 1000; // seconds
      if (dt > 0 && dt < 2.0) { // ignore large pauses / gaps
        this.effectiveFps = 0.9 * this.effectiveFps + 0.1 * (1 / dt);

        // Adaptively redesign the Butterworth filter if the measured sample
        // rate has drifted by more than ±5 Hz from the filter's design rate.
        if (Math.abs(this.effectiveFps - this.filter.designedFs) > 2) {
          this.filter.updateSampleRate(Math.round(this.effectiveFps));
        }
      }
    }
    this.lastTimestamp = now;

    this.rawBuffer.push(dy);
    this.filteredBuffer.push(this.filter.step(dy));
    this.timestampsBuffer.push(now);

    // Maintain ~10-second duration rolling window (time-based buffer)
    while (
      this.timestampsBuffer.length > 2 &&
      (now - this.timestampsBuffer[0]) / 1000 > TARGET_WINDOW_SEC
    ) {
      this.timestampsBuffer.shift();
      this.rawBuffer.shift();
      this.filteredBuffer.shift();
    }

    // Bounded memory hard cap
    if (this.rawBuffer.length > MAX_BUFFER_CAPACITY) {
      this.timestampsBuffer.shift();
      this.rawBuffer.shift();
      this.filteredBuffer.shift();
    }

    // Once the displacement buffer is full, compute instantaneous spectral RR
    // and append to history ONLY if signal energy and quality gates pass.
    if (this.isBufferFull) {
      const stats = this.computeSpectralStats();
      if (stats.isValid && stats.rr >= 8 && stats.rr <= 30) {
        this.rrHistory.push(stats.rr);
        if (this.rrHistory.length > RR_SMOOTH_WINDOW) {
          this.rrHistory.shift();
        }
      }
    }
  }

  /** True once the rolling buffer has accumulated approximately 10 seconds of signal. */
  get isBufferFull(): boolean {
    if (this.timestampsBuffer.length < 2) return false;
    const durationSec = (this.timestampsBuffer[this.timestampsBuffer.length - 1] - this.timestampsBuffer[0]) / 1000;
    return durationSec >= 9.5;
  }

  /**
   * Computes spectral stats and estimates respiratory rate using FFT.
   * Also validates signal energy and spectral quality against noise thresholds.
   */
  computeSpectralStats(): SpectralStats {
    const resampled = resampleSignalUniformly(this.filteredBuffer, this.timestampsBuffer);
    const sig = resampled && resampled.signal.length >= 16 ? resampled.signal : this.filteredBuffer;
    const fftFs = resampled ? resampled.targetFs : this.effectiveFps;

    const durationSec =
      this.timestampsBuffer.length >= 2
        ? (this.timestampsBuffer[this.timestampsBuffer.length - 1] - this.timestampsBuffer[0]) / 1000
        : 0;

    if (sig.length < 16) {
      return {
        rms: 0,
        p2p: 0,
        variance: 0,
        peakFrequency: 0,
        peakPower: 0,
        bandPower: 0,
        peakPowerRatio: 0,
        signalQuality: 'LOW',
        isValid: false,
        rr: 0,
        zeroCrossings: 0,
        bufferSeconds: durationSec,
        sampleCount: sig.length,
        fftResolutionHz: fftFs / 2048,
        originalSampleCount: this.filteredBuffer.length,
        originalEffectiveFps: resampled?.originalEffectiveFps ?? this.effectiveFps,
        dtMeanMs: resampled?.dtMeanMs,
        dtStdMs: resampled?.dtStdMs,
        resampledSampleCount: sig.length,
        resampledFps: fftFs,
      };
    }

    // 1. Time-domain statistics
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let sumSq = 0;
    let zeroCrossings = 0;

    for (let i = 0; i < sig.length; i++) {
      const v = sig[i];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
      sumSq += v * v;
      if (i > 0) {
        if ((sig[i - 1] < 0 && sig[i] >= 0) || (sig[i - 1] >= 0 && sig[i] < 0)) {
          zeroCrossings++;
        }
      }
    }

    const meanVal = sum / sig.length;
    const rms = Math.sqrt(sumSq / sig.length);
    const p2p = max - min;
    let varSum = 0;
    for (let i = 0; i < sig.length; i++) {
      const diff = sig[i] - meanVal;
      varSum += diff * diff;
    }
    const variance = varSum / sig.length;

    // 2. Zero-padded FFT for fine frequency resolution
    const N = 2048;
    const fft = new FFT(N);
    const out = fft.createComplexArray();

    const padded = new Array(N).fill(0);
    const len = Math.min(sig.length, N);
    for (let i = 0; i < len; i++) {
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (len - 1)));
      padded[i] = sig[i] * w;
    }

    const complexIn = fft.createComplexArray();
    for (let i = 0; i < N; i++) {
      complexIn[2 * i] = padded[i];
      complexIn[2 * i + 1] = 0;
    }
    fft.transform(out, complexIn);

    let maxPwr = 0;
    let maxIdx = -1;
    let bandPwr = 0;
    const pwrArr = new Float64Array(N / 2 + 1);

    for (let k = 0; k <= N / 2; k++) {
      const freq = (k * fftFs) / N;
      const re = out[2 * k];
      const im = out[2 * k + 1];
      const pwr = re * re + im * im;
      pwrArr[k] = pwr;

      if (freq >= RESP_LO_HZ && freq <= RESP_HI_HZ) {
        bandPwr += pwr;
        if (pwr > maxPwr) {
          maxPwr = pwr;
          maxIdx = k;
        }
      }
    }

    let peakFreq = 0;
    if (maxIdx > 0 && maxIdx < N / 2) {
      const alpha = Math.log(pwrArr[maxIdx - 1] + 1e-12);
      const beta = Math.log(pwrArr[maxIdx] + 1e-12);
      const gamma = Math.log(pwrArr[maxIdx + 1] + 1e-12);
      const delta = (0.5 * (alpha - gamma)) / (alpha - 2 * beta + gamma);
      const refinedIdx = maxIdx + (isNaN(delta) ? 0 : delta);
      peakFreq = (refinedIdx * fftFs) / N;
    }

    const peakPowerRatio = bandPwr > 0 ? maxPwr / bandPwr : 0;
    const estimatedRr = Math.round(peakFreq * 60);

    // Collect local spectral peaks in the respiratory band (0.133–0.500 Hz)
    interface RawPeak {
      k: number;
      power: number;
    }
    const rawPeaks: RawPeak[] = [];
    for (let k = 1; k < N / 2; k++) {
      const freq = (k * fftFs) / N;
      if (freq >= RESP_LO_HZ && freq <= RESP_HI_HZ) {
        if (pwrArr[k] >= pwrArr[k - 1] && pwrArr[k] >= pwrArr[k + 1]) {
          rawPeaks.push({ k, power: pwrArr[k] });
        }
      }
    }

    // Sort peaks by power descending
    rawPeaks.sort((a, b) => b.power - a.power);

    // Build topPeaks array with parabolic peak interpolation for top 5
    const topPeaks: SpectralPeak[] = rawPeaks.slice(0, 5).map((peak, idx) => {
      const k = peak.k;
      let peakF = (k * fftFs) / N;
      if (k > 0 && k < N / 2) {
        const alpha = Math.log(pwrArr[k - 1] + 1e-12);
        const beta = Math.log(pwrArr[k] + 1e-12);
        const gamma = Math.log(pwrArr[k + 1] + 1e-12);
        const delta = (0.5 * (alpha - gamma)) / (alpha - 2 * beta + gamma);
        const refinedIdx = k + (isNaN(delta) ? 0 : delta);
        peakF = (refinedIdx * fftFs) / N;
      }
      return {
        freqHz: Number(peakF.toFixed(3)),
        bpm: Number((peakF * 60).toFixed(1)),
        power: Number(peak.power.toFixed(6)),
        ratio: Number((bandPwr > 0 ? peak.power / bandPwr : 0).toFixed(4)),
        rank: idx + 1,
      };
    });

    const selectedRankIdx = rawPeaks.findIndex((p) => p.k === maxIdx);
    const selectedPeakRank = selectedRankIdx >= 0 ? selectedRankIdx + 1 : 1;

    // ── 3. Validation gates (PRODUCTION — unchanged) ─────────────────────────
    const isEnergyValid = rms >= MIN_RESP_RMS && p2p >= MIN_RESP_P2P;
    const isRatioValid = peakPowerRatio >= MIN_PEAK_POWER_RATIO;
    const isRateValid = estimatedRr >= 8 && estimatedRr <= 30;
    const isValid = isEnergyValid && isRatioValid && isRateValid;

    let signalQuality: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (isValid) {
      if (rms >= 2 * MIN_RESP_RMS && peakPowerRatio >= 2 * MIN_PEAK_POWER_RATIO) {
        signalQuality = 'HIGH';
      } else {
        signalQuality = 'MEDIUM';
      }
    }

    // ── 4. DIAGNOSTIC: stability vs. previous snapshot ────────────────────────
    // Tolerance for considering two peaks "the same": ±0.030 Hz (≈ ±1.8 BPM).
    const FREQ_MATCH_TOL_HZ = 0.030;

    const prevFreq = this.diagPrevSelectedFreqHz;
    const freqDelta = prevFreq !== null ? Math.abs(peakFreq - prevFreq) : 0;
    const frequencyJumpBpm = prevFreq !== null ? Math.abs(peakFreq - prevFreq) * 60 : 0;
    const peakSwitched = prevFreq !== null && freqDelta > FREQ_MATCH_TOL_HZ;

    // ── 5. DIAGNOSTIC: harmonic detection ─────────────────────────────────────
    // For each other top-3 peak, check whether the selected peak is an
    // integer multiple (2×, 3×) of that peak's frequency.
    // We check ratios 2.0 and 3.0 (±15% tolerance) since the 10→20 BPM
    // harmonic doubling is the primary suspect.
    const HARMONIC_TOL = 0.15; // relative tolerance on ratio
    let isPossibleHarmonic = false;
    let harmonicRatio = 0;
    let fundamentalCandidateBpm = 0;

    for (const candidate of topPeaks) {
      if (candidate.freqHz === 0) continue;
      const ratio = peakFreq / candidate.freqHz;
      for (const expectedRatio of [2, 3]) {
        if (Math.abs(ratio - expectedRatio) / expectedRatio <= HARMONIC_TOL) {
          // The selected peak is ~N× the frequency of this candidate
          isPossibleHarmonic = true;
          harmonicRatio = Number(ratio.toFixed(2));
          fundamentalCandidateBpm = Number((candidate.freqHz * 60).toFixed(1));
          break;
        }
      }
      if (isPossibleHarmonic) break;
    }

    // ── 6. DIAGNOSTIC: peak competition ───────────────────────────────────────
    // If rank-1 power is within 40% of rank-2 power the spectrum is competitive.
    const COMPETITION_RATIO = 0.6; // rank-2 power / rank-1 power threshold
    let hasStrongCompetition = false;
    if (topPeaks.length >= 2) {
      const r1pwr = topPeaks[0].power;
      const r2pwr = topPeaks[1].power;
      hasStrongCompetition = r1pwr > 0 && r2pwr / r1pwr >= COMPETITION_RATIO;
    }

    // ── 7. DIAGNOSTIC: classification ─────────────────────────────────────────
    let diagnosticClassification: DiagnosticClassification;

    if (topPeaks.length === 0) {
      diagnosticClassification = 'NO_STABLE_PEAK';
    } else if (peakSwitched && isPossibleHarmonic) {
      diagnosticClassification = 'POSSIBLE_HARMONIC';
    } else if (peakSwitched) {
      diagnosticClassification = 'PEAK_SWITCH';
    } else if (hasStrongCompetition) {
      diagnosticClassification = 'MULTIPLE_COMPETING_PEAKS';
    } else if (!peakSwitched) {
      diagnosticClassification = 'STABLE_RESPIRATORY_PEAK';
    } else {
      diagnosticClassification = 'NO_STABLE_PEAK';
    }

    // ── 8. Persist for next snapshot (diagnostic-only state) ──────────────────
    this.diagPrevSelectedFreqHz = peakFreq;

    return {
      rms,
      p2p,
      variance,
      peakFrequency: peakFreq,
      peakPower: maxPwr,
      bandPower: bandPwr,
      peakPowerRatio,
      signalQuality,
      isValid,
      rr: isValid ? estimatedRr : 0,
      zeroCrossings,
      bufferSeconds: durationSec,
      sampleCount: sig.length,
      fftResolutionHz: this.fftResolutionHz,
      topPeaks,
      selectedPeakRank,

      // Stability
      previousSelectedFreqHz: prevFreq !== null ? Number(prevFreq.toFixed(3)) : undefined,
      currentSelectedFreqHz: Number(peakFreq.toFixed(3)),
      frequencyDeltaHz: prevFreq !== null ? Number(freqDelta.toFixed(3)) : undefined,
      previousSelectedBpm: prevFreq !== null ? Number((prevFreq * 60).toFixed(1)) : undefined,
      currentSelectedBpm: Number((peakFreq * 60).toFixed(1)),
      frequencyJumpBpm: prevFreq !== null ? Number(frequencyJumpBpm.toFixed(1)) : undefined,

      // Harmonic
      isPossibleHarmonic,
      harmonicRatio: isPossibleHarmonic ? harmonicRatio : undefined,
      fundamentalCandidateBpm: isPossibleHarmonic ? fundamentalCandidateBpm : undefined,

      // Classification
      diagnosticClassification,

      // Resampling diagnostics
      originalSampleCount: this.filteredBuffer.length,
      originalEffectiveFps: resampled?.originalEffectiveFps ?? this.effectiveFps,
      dtMeanMs: resampled?.dtMeanMs,
      dtStdMs: resampled?.dtStdMs,
      resampledSampleCount: sig.length,
      resampledFps: fftFs,
    };
  }

  /**
   * Pre-smoothing (raw) instantaneous RR estimate in brpm.
   * Exposed for diagnostic logging; prefer `getRespRate()` for display.
   * Returns 0 if the buffer is not yet full or signal energy is insufficient.
   */
  getRespRateRaw(): number {
    if (!this.isBufferFull) return 0;
    return this.computeSpectralStats().rr;
  }

  /**
   * Smoothed respiratory rate (breaths/min) — rolling average over recent estimates.
   * Returns 0 if the buffer is not yet full or no valid estimates exist.
   */
  getRespRate(): number {
    if (!this.isBufferFull || this.rrHistory.length === 0) return 0;
    const stats = this.computeSpectralStats();
    if (!stats.isValid) return 0;
    const sum = this.rrHistory.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.rrHistory.length);
  }

  get sampleCount(): number {
    return this.rawBuffer.length;
  }

  get timestampStats(): { minDt: number; maxDt: number; meanDt: number; stdDt: number } {
    if (this.timestampsBuffer.length < 2) {
      return { minDt: 0, maxDt: 0, meanDt: 0, stdDt: 0 };
    }

    const dts: number[] = [];
    for (let i = 1; i < this.timestampsBuffer.length; i++) {
      dts.push((this.timestampsBuffer[i] - this.timestampsBuffer[i - 1]) / 1000);
    }

    let sum = 0;
    let sumSq = 0;
    let minDt = Infinity;
    let maxDt = -Infinity;
    for (const dt of dts) {
      sum += dt;
      sumSq += dt * dt;
      if (dt < minDt) minDt = dt;
      if (dt > maxDt) maxDt = dt;
    }

    const meanDt = sum / dts.length;
    const variance = dts.length > 1 ? Math.max(0, sumSq / dts.length - meanDt * meanDt) : 0;
    const stdDt = Math.sqrt(variance);
    return { minDt, maxDt, meanDt, stdDt };
  }

  get fftResolutionHz(): number {
    return this.effectiveFps > 0 ? this.effectiveFps / 2048 : 0;
  }

  // ── Diagnostic Getters for Phase 1 ────────────────────────────────────────

  get signalStats(): { min: number; max: number; p2p: number; rms: number; zeroCrossings: number; bufferSeconds: number } {
    const sig = this.filteredBuffer;
    if (sig.length === 0) {
      return { min: 0, max: 0, p2p: 0, rms: 0, zeroCrossings: 0, bufferSeconds: 0 };
    }
    let min = Infinity;
    let max = -Infinity;
    let sumSq = 0;
    let crossings = 0;

    for (let i = 0; i < sig.length; i++) {
      const v = sig[i];
      if (v < min) min = v;
      if (v > max) max = v;
      sumSq += v * v;
      if (i > 0) {
        if ((sig[i - 1] < 0 && sig[i] >= 0) || (sig[i - 1] >= 0 && sig[i] < 0)) {
          crossings++;
        }
      }
    }

    const durationSec =
      this.timestampsBuffer.length >= 2
        ? (this.timestampsBuffer[this.timestampsBuffer.length - 1] - this.timestampsBuffer[0]) / 1000
        : 0;

    return {
      min,
      max,
      p2p: max - min,
      rms: Math.sqrt(sumSq / sig.length),
      zeroCrossings: crossings,
      bufferSeconds: durationSec,
    };
  }

  get effectiveFpsValue(): number {
    return this.effectiveFps;
  }

  get rawBufferLength(): number {
    return this.rawBuffer.length;
  }

  get filteredBufferLength(): number {
    return this.filteredBuffer.length;
  }

  get rrHistoryLength(): number {
    return this.rrHistory.length;
  }

  reset(): void {
    this.timestampsBuffer.length = 0;
    this.rawBuffer.length = 0;
    this.filteredBuffer.length = 0;
    this.rrHistory.length = 0;
    this.filter.reset();
    this.lastTimestamp = -1;
    this.diagPrevSelectedFreqHz = null;
  }
}

// ---------------------------------------------------------------------------
// Motion asymmetry feature extraction
// ---------------------------------------------------------------------------

/** Landmark indices considered part of the LEFT facial half (as seen by camera,
 *  which is the subject's actual right — but we label by camera perspective). */
export const LEFT_LANDMARK_INDICES = [61, 291] as const;  // mouth corners (left side in mirrored view)
/** Landmark indices for the RIGHT facial half. */
export const RIGHT_LANDMARK_INDICES = [199, 152] as const; // chin + nose base

/**
 * Tracks per-landmark flow vectors over a short window and returns the
 * `motionAsymmetryFlag` feature vector.
 *
 * The 5-element result layout:
 *   [0] leftMeanDx        — mean horizontal flow on the left facial half
 *   [1] leftMeanDy        — mean vertical flow on the left facial half
 *   [2] rightMeanDx       — mean horizontal flow on the right facial half
 *   [3] rightMeanDy       — mean vertical flow on the right facial half
 *   [4] asymmetryMagnitude — normalised |leftMag − rightMag| in [0, 1]
 */
export class MotionAsymmetryTracker {
  // Short ring-buffer: last N frames of per-landmark (dx, dy) flows
  private readonly WINDOW = 15; // ~0.5 s at 30 fps
  private leftFlows: Array<[number, number]> = [];
  private rightFlows: Array<[number, number]> = [];

  /**
   * Record one frame's optical-flow vectors for each landmark set.
   *
   * @param leftVectors  Array of (dx, dy) pairs for left-side landmarks
   * @param rightVectors Array of (dx, dy) pairs for right-side landmarks
   */
  push(leftVectors: [number, number][], rightVectors: [number, number][]): void {
    // Compute per-frame mean flow for left and right groups
    const leftDx = mean(leftVectors.map(([dx]) => dx));
    const leftDy = mean(leftVectors.map(([, dy]) => dy));
    const rightDx = mean(rightVectors.map(([dx]) => dx));
    const rightDy = mean(rightVectors.map(([, dy]) => dy));

    this.leftFlows.push([leftDx, leftDy]);
    this.rightFlows.push([rightDx, rightDy]);

    if (this.leftFlows.length > this.WINDOW) this.leftFlows.shift();
    if (this.rightFlows.length > this.WINDOW) this.rightFlows.shift();
  }

  /**
   * Compute the current `motionAsymmetryFlag` feature vector.
   * Returns a zero vector if not enough frames have been collected yet.
   */
  compute(): [number, number, number, number, number] {
    if (this.leftFlows.length < 2 || this.rightFlows.length < 2) {
      return [0, 0, 0, 0, 0];
    }

    const leftMeanDx = mean(this.leftFlows.map(([dx]) => dx));
    const leftMeanDy = mean(this.leftFlows.map(([, dy]) => dy));
    const rightMeanDx = mean(this.rightFlows.map(([dx]) => dx));
    const rightMeanDy = mean(this.rightFlows.map(([, dy]) => dy));

    const leftMag = Math.sqrt(leftMeanDx ** 2 + leftMeanDy ** 2);
    const rightMag = Math.sqrt(rightMeanDx ** 2 + rightMeanDy ** 2);

    // Normalise asymmetry to [0, 1] using the sum of magnitudes as the range
    const sumMag = leftMag + rightMag;
    const asymmetryMagnitude = sumMag > 0 ? Math.abs(leftMag - rightMag) / sumMag : 0;

    return [leftMeanDx, leftMeanDy, rightMeanDx, rightMeanDy, asymmetryMagnitude];
  }

  reset(): void {
    this.leftFlows = [];
    this.rightFlows = [];
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

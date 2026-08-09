// fft.js is a CommonJS module, but it works in Vite usually.
import FFT from 'fft.js';
import { HrvEstimator } from './hrv';
import type { HrvResult } from './hrv';

/**
 * Minimum power magnitude required to treat the FFT peak as a real signal.
 *
 * When the CHROM signal is flat (e.g. because the background-referencing step
 * divided out the pulse component), every bin in the power spectrum is
 * numerically near-zero and maxBinIndex silently stays at its initial value
 * of minBin — producing a fake ~20 BPM "result".  This threshold gates that
 * out:  if no bin exceeds MIN_PEAK_POWER we return valid=false instead of a
 * meaningless frequency.
 *
 * Value chosen conservatively — real pulse signals produce magnitudes orders
 * of magnitude above this in typical lighting.
 */
const MIN_PEAK_POWER = 1e-6;

export type { HrvResult };

export class FFTProcessor {
  /**
   * Applies a Hanning window to the signal to reduce spectral leakage.
   */
  static applyHanningWindow(signal: number[]): number[] {
    const N = signal.length;
    const windowed = new Array(N);
    for (let i = 0; i < N; i++) {
      const multiplier = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
      windowed[i] = signal[i] * multiplier;
    }
    return windowed;
  }

  /**
   * Analyzes the signal via FFT to find BPM and HRV.
   *
   * Returns { bpm, hrv, hrvResult, valid: true } when a clear spectral peak
   * is found in the physiological HR band (0.7–3.0 Hz / 42–180 BPM).
   *
   * Returns { bpm: 0, hrv: 0, valid: false } when maxPower is below the
   * noise floor — callers must treat this as a failed frame, not a real
   * reading.  This prevents the silent fallback where maxBinIndex stays at
   * minBin and reports ~20 BPM for a flat/invalid signal.
   *
   * @param signal      The 1D pulse signal (e.g., from CHROM)
   * @param fps         The frame rate of the signal (e.g., 60)
   * @param timestamps  Per-sample timestamps in ms (optional; required for HRV)
   * @param sqi         Signal Quality Index (optional; required for HRV gating)
   */
  static analyze(
    signal: number[],
    fps: number = 60,
    timestamps?: number[],
    sqi?: number,
  ): { bpm: number; hrv: number; hrvResult?: HrvResult; valid: boolean } {
    // FFT size must be a power of 2. Find the next power of 2.
    // e.g., for a 600 frame window (10s @ 60fps), size = 1024
    const minSize = signal.length;
    let n = 1;
    while (n < minSize) n *= 2;

    const f = new FFT(n);
    const input = f.createComplexArray();
    const output = f.createComplexArray();

    // 1. Demean (remove DC offset) from the raw signal FIRST before windowing
    const mean = signal.length > 0 ? signal.reduce((a, b) => a + b, 0) / signal.length : 0;
    const demeanedSignal = signal.map((val) => val - mean);

    // 2. Apply Hanning window to the demeaned signal to reduce spectral leakage
    const windowedSignal = this.applyHanningWindow(demeanedSignal);

    // 3. Populate complex array for FFT transformation with zero padding
    for (let i = 0; i < n; i++) {
      if (i < windowedSignal.length) {
        input[i * 2] = windowedSignal[i]; // Real part
      } else {
        input[i * 2] = 0; // Zero padding
      }
      input[i * 2 + 1] = 0; // Imaginary part
    }

    f.transform(output, input);

    // Calculate power spectrum
    const power = new Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      const real = output[i * 2];
      const imag = output[i * 2 + 1];
      power[i] = Math.sqrt(real * real + imag * imag);
    }

    // -----------------------------------------------------------------------
    // Bandpass window: 0.7 – 3.0 Hz  (42 – 180 BPM)
    //
    //   Lower bound 0.7 Hz  → filters DC drift and respiratory artefacts
    //                          (respiration sits at ~0.15–0.4 Hz).
    //   Upper bound 3.0 Hz  → keeps us inside the physiological pulse range
    //                          and avoids locking onto the 2nd harmonic of a
    //                          ~1.5 Hz (90 BPM) fundamental that lands at 3 Hz.
    //
    // Using 4.0 Hz would include that harmonic and can cause the peak detector
    // to report double the true heart rate under noisy conditions.
    // -----------------------------------------------------------------------
    const MIN_FREQ_HZ = 0.7;  // 42 BPM
    const MAX_FREQ_HZ = 3.0;  // 180 BPM

    // Frequency bin resolution: fs / N
    const freqResolution = fps / n;

    const minBin = Math.floor(MIN_FREQ_HZ / freqResolution);
    const maxBin = Math.ceil(MAX_FREQ_HZ / freqResolution);

    let maxPower = 0;
    let maxBinIndex = minBin;

    for (let i = minBin; i <= maxBin; i++) {
      if (power[i] > maxPower) {
        maxPower = power[i];
        maxBinIndex = i;
      }
    }

    // ── Debug: log actual peak power so we can distinguish "no signal" from
    //    "signal at wrong location" without re-running a full reproduction.
    console.log(
      `[FFT] maxPower=${maxPower.toExponential(3)} ` +
      `peakBin=${maxBinIndex} freqRes=${freqResolution.toFixed(4)} Hz/bin`,
    );

    // ── Silent-fallback guard ────────────────────────────────────────────────
    // If maxPower never exceeded the noise floor, the signal is flat/invalid
    // (e.g. CHROM was given a uniform-colour window due to bad background
    // referencing).  Return valid=false so the caller treats this as a failed
    // frame rather than recording the minBin default as a real BPM.
    if (maxPower < MIN_PEAK_POWER) {
      console.warn('[FFT] No spectral peak found — signal may be flat or corrupted.');
      return { bpm: 0, hrv: 0, valid: false };
    }

    // Quadratic (parabolic) peak interpolation for sub-bin frequency accuracy
    let interpolatedBin = maxBinIndex;

    if (maxBinIndex > 0 && maxBinIndex < power.length - 1) {
      const alpha = power[maxBinIndex - 1];
      const beta = power[maxBinIndex];
      const gamma = power[maxBinIndex + 1];

      const denom = alpha - 2 * beta + gamma;
      if (denom !== 0) {
        let delta = (0.5 * (alpha - gamma)) / denom;
        if (Number.isNaN(delta)) {
          delta = 0;
        } else if (delta > 0.5) {
          delta = 0.5;
        } else if (delta < -0.5) {
          delta = -0.5;
        }
        interpolatedBin = maxBinIndex + delta;
      }
    }

    const dominantFreq = interpolatedBin * freqResolution;
    const bpm = dominantFreq * 60;

    // ── Time-domain HRV via beat-to-beat interval analysis ──────────────────
    // HrvEstimator operates on the raw (un-windowed) CHROM signal and its
    // per-sample timestamps.  It is decoupled from FFT so it can use the full
    // temporal resolution of the waveform without Hann windowing distortion.
    let hrv = 0;
    let hrvResult: HrvResult | undefined;

    if (timestamps && timestamps.length === signal.length) {
      const effectiveSqi = typeof sqi === 'number' ? sqi : 1.0;
      hrvResult = HrvEstimator.analyze(signal, timestamps, effectiveSqi);
      hrv = hrvResult.hrvValid ? hrvResult.rmssd : 0;
    }

    return { bpm, hrv, hrvResult, valid: true };
  }
}

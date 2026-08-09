/**
 * Minimal 2nd-order Butterworth bandpass IIR filter (pure TypeScript, no deps).
 *
 * Used to isolate the respiratory oscillation (0.1 – 0.5 Hz, i.e. 6 – 30 brpm)
 * from the shoulder/torso vertical-displacement time series.
 *
 * Design approach: two cascaded 2nd-order biquad sections obtained by the
 * bilinear transform of an analogue Butterworth prototype.
 *
 * Reference:
 *   Proakis & Manolakis, "Digital Signal Processing", 4th ed., §10.3
 */

/** Biquad section coefficients: y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2]
 *                                           - a1*y[n-1] - a2*y[n-2]           */
interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** Per-section delay-line state (direct-form II transposed). */
interface BiquadState {
  w1: number;
  w2: number;
}

function makeBiquadState(): BiquadState {
  return { w1: 0, w2: 0 };
}

/**
 * Process one sample through a biquad section (direct-form II transposed).
 * Mutates `state` in place and returns the filtered output sample.
 */
function biquadStep(x: number, c: BiquadCoeffs, state: BiquadState): number {
  const y = c.b0 * x + state.w1;
  state.w1 = c.b1 * x - c.a1 * y + state.w2;
  state.w2 = c.b2 * x - c.a2 * y;
  return y;
}

/**
 * Design a 2nd-order Butterworth bandpass biquad pair using the bilinear
 * transform.
 *
 * The bandpass is built as the cascade of a high-pass and a low-pass biquad
 * so that each section remains 2nd-order and numerically stable.
 *
 * @param loHz  Lower -3 dB frequency in Hz
 * @param hiHz  Upper -3 dB frequency in Hz
 * @param fs    Sample rate in Hz
 */
function designButterworthBandpass(
  loHz: number,
  hiHz: number,
  fs: number,
): [BiquadCoeffs, BiquadCoeffs] {
  // Pre-warped cutoff frequencies
  const whp = Math.tan((Math.PI * loHz) / fs);
  const wlp = Math.tan((Math.PI * hiHz) / fs);

  // 2nd-order High-pass biquad (cuts below loHz)
  const normHp = 1 + Math.SQRT2 * whp + whp * whp;
  const hpBiquad: BiquadCoeffs = {
    b0: 1 / normHp,
    b1: -2 / normHp,
    b2: 1 / normHp,
    a1: (2 * (whp * whp - 1)) / normHp,
    a2: (1 - Math.SQRT2 * whp + whp * whp) / normHp,
  };

  // 2nd-order Low-pass biquad (cuts above hiHz)
  const normLp = 1 + Math.SQRT2 * wlp + wlp * wlp;
  const lpBiquad: BiquadCoeffs = {
    b0: (wlp * wlp) / normLp,
    b1: (2 * wlp * wlp) / normLp,
    b2: (wlp * wlp) / normLp,
    a1: (2 * (wlp * wlp - 1)) / normLp,
    a2: (1 - Math.SQRT2 * wlp + wlp * wlp) / normLp,
  };

  return [hpBiquad, lpBiquad];
}

// ---------------------------------------------------------------------------
// Public class
// ---------------------------------------------------------------------------

/**
 * Stateful 2nd-order Butterworth bandpass filter designed for the respiratory
 * displacement signal.
 *
 * Default passband: 0.1 – 0.5 Hz at the input sample rate.
 * Call `reset()` if you want to clear the delay-line state (e.g. after a long
 * gap in the signal).
 */
export class ButterworthBandpass {
  private hpCoeffs: BiquadCoeffs;
  private lpCoeffs: BiquadCoeffs;
  private hpState: BiquadState = makeBiquadState();
  private lpState: BiquadState = makeBiquadState();

  /** Passband edges stored so coefficients can be redesigned at a new fs. */
  private readonly loHz: number;
  private readonly hiHz: number;

  /**
   * Sample rate at which the current biquad coefficients were designed.
   * Exposed so callers can check whether a redesign is needed.
   */
  designedFs: number;

  /**
   * @param loHz Lower -3 dB cutoff (default 0.1 Hz = 6 brpm)
   * @param hiHz Upper -3 dB cutoff (default 0.5 Hz = 30 brpm)
   * @param fs   Sample rate in Hz.  The motion worker operates at ~15–30 Hz
   *             after optical-flow pooling, so use the actual dispatch rate.
   */
  constructor(loHz = 0.1, hiHz = 0.5, fs = 30) {
    this.loHz = loHz;
    this.hiHz = hiHz;
    this.designedFs = fs;
    const [hp, lp] = designButterworthBandpass(loHz, hiHz, fs);
    this.hpCoeffs = hp;
    this.lpCoeffs = lp;
  }

  /**
   * Redesign the biquad coefficients for a new sample rate and reset the
   * IIR delay-line state.
   *
   * The delay state MUST be reset because the pole locations shift with fs;
   * keeping stale state from the old poles would produce a transient
   * instability in the first several output samples.
   *
   * @param fs  New sample rate in Hz.
   */
  updateSampleRate(fs: number): void {
    const [hp, lp] = designButterworthBandpass(this.loHz, this.hiHz, fs);
    this.hpCoeffs = hp;
    this.lpCoeffs = lp;
    this.hpState = makeBiquadState();
    this.lpState = makeBiquadState();
    this.designedFs = fs;
  }

  /** Filter a single sample and return the bandpassed output. */
  step(x: number): number {
    const afterHP = biquadStep(x, this.hpCoeffs, this.hpState);
    return biquadStep(afterHP, this.lpCoeffs, this.lpState);
  }

  /** Filter an entire array of samples in one call (in-place). */
  process(samples: number[]): number[] {
    return samples.map((s) => this.step(s));
  }

  /** Reset delay-line state (coefficients are kept). */
  reset(): void {
    this.hpState = makeBiquadState();
    this.lpState = makeBiquadState();
  }
}

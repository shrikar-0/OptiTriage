import { describe, it, expect } from 'vitest';
import { HrvEstimator } from './hrv';

function makePulseSequence(fps: number, durationSec: number, ibiMs = 1000) {
  const dt = 1000 / fps;
  const n = Math.round(durationSec * fps);
  const signal: number[] = [];
  const timestamps: number[] = [];
  let t = 0;
  // Simple model: repeated cycles of length ibiMs -> approximate peaked waveform
  while (t < durationSec * 1000) {
    const steps = Math.max(1, Math.round(ibiMs / dt));
    for (let s = 0; s < steps && t < durationSec * 1000; s++) {
      const phase = (s / steps) * 2 * Math.PI;
      const val = Math.sin(phase) + 0.5 * Math.sin(2 * phase);
      signal.push(val);
      timestamps.push(t);
      t += dt;
    }
  }
  return { signal, timestamps };
}

describe('HrvEstimator time-window behaviour', () => {
  it('works at 30 FPS (should detect valid HRV)', () => {
    const { signal, timestamps } = makePulseSequence(30, 10, 1000);
    const res = HrvEstimator.analyze(signal, timestamps, 0.95);
    expect(res).toBeDefined();
    expect(res.diag).toBeDefined();
    expect(res.diag?.effectiveSampleRateHz).toBeGreaterThan(25);
    expect(res.hrvValid).toBe(true);
    expect(res.rejectionReason).toBe('NONE');
    expect(res.detectedBeats).toBeGreaterThanOrEqual(6);
  });

  it('works at 15 FPS (should remain valid if all other gates pass)', () => {
    const { signal, timestamps } = makePulseSequence(15, 10, 1000);
    const res = HrvEstimator.analyze(signal, timestamps, 0.95);
    expect(res).toBeDefined();
    expect(res.diag).toBeDefined();
    expect(res.diag?.effectiveSampleRateHz).toBeGreaterThanOrEqual(15);
    expect(res.hrvValid).toBe(true);
    expect(res.rejectionReason).toBe('NONE');
    expect(res.detectedBeats).toBeGreaterThanOrEqual(6);
  });

  it('rejects at 14.9 FPS with LOW_FRAME_RATE', () => {
    const { signal, timestamps } = makePulseSequence(14.9, 10, 1000);
    const res = HrvEstimator.analyze(signal, timestamps, 0.95);
    expect(res).toBeDefined();
    expect(res.hrvValid).toBe(false);
    expect(res.rejectionReason).toBe('LOW_FRAME_RATE');
    expect(res.rmssd).toBe(0);
    expect(res.sdnn).toBe(0);
    expect(res.heartRateFromIbi).toBe(0);
    expect(res.diag).toBeDefined();
  });

  it('rejects at 8 FPS with LOW_FRAME_RATE while preserving diagnostics', () => {
    const { signal, timestamps } = makePulseSequence(8, 10, 1000);
    const res = HrvEstimator.analyze(signal, timestamps, 0.95);
    expect(res).toBeDefined();
    expect(res.hrvValid).toBe(false);
    expect(res.rejectionReason).toBe('LOW_FRAME_RATE');
    expect(res.rmssd).toBe(0);
    expect(res.sdnn).toBe(0);
    expect(res.heartRateFromIbi).toBe(0);
    expect(res.diag).toBeDefined();
    expect(Math.round(res.diag!.effectiveSampleRateHz)).toBeCloseTo(8, 0);
    expect(res.detectedBeats).toBeGreaterThan(0);
    expect(res.rawIBIsMs.length).toBeGreaterThan(0);
  });

  it('rejects at ~4.8 FPS with LOW_FRAME_RATE while preserving diagnostics', () => {
    const { signal, timestamps } = makePulseSequence(4.81, 10, 1000);
    const res = HrvEstimator.analyze(signal, timestamps, 0.95);
    expect(res).toBeDefined();
    expect(res.hrvValid).toBe(false);
    expect(res.rejectionReason).toBe('LOW_FRAME_RATE');
    expect(res.rmssd).toBe(0);
    expect(res.sdnn).toBe(0);
    expect(res.heartRateFromIbi).toBe(0);
    expect(res.diag).toBeDefined();
    expect(res.diag?.effectiveSampleRateHz).toBeLessThan(5);
  });

  it('rejects irregular timestamps whose measured effective FPS is below 15 with LOW_FRAME_RATE', () => {
    // 10 FPS with jitter -> ~10 Hz average
    const fps = 10;
    const dt = 1000 / fps;
    const durationSec = 10;
    const signal: number[] = [];
    const timestamps: number[] = [];
    let t = 0;
    while (t < durationSec * 1000) {
      const stepsPerBeat = Math.round(1000 / dt);
      const phase = (signal.length % stepsPerBeat) / stepsPerBeat * 2 * Math.PI;
      signal.push(Math.sin(phase));
      const jitter = ((signal.length * 37) % 11) - 5; // [-5,5] ms
      timestamps.push(Math.max(0, t + jitter));
      t += dt;
    }

    const res = HrvEstimator.analyze(signal, timestamps, 0.95);
    expect(res).toBeDefined();
    expect(res.hrvValid).toBe(false);
    expect(res.rejectionReason).toBe('LOW_FRAME_RATE');
    expect(res.diag).toBeDefined();
    expect(res.diag?.effectiveSampleRateHz).toBeLessThan(15);
  });

  it('returns INSUFFICIENT_DATA for very short signals', () => {
    const signal = [0, 1, 0, -1];
    const timestamps = [0, 100, 200, 300];
    const res = HrvEstimator.analyze(signal, timestamps, 0.95);
    expect(res.hrvValid).toBe(false);
    expect(res.rejectionReason).toBe('INSUFFICIENT_DATA');
  });
});

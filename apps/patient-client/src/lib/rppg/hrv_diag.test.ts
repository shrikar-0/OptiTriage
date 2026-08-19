// @ts-nocheck

import { describe, it, expect } from 'vitest';
import { HrvEstimator } from './hrv';

// Helper to create a simple pulse with controlled IBIs
function makePulseWithIbis(ibiSequenceMs: number[], fps = 60) {
  const dt = 1000 / fps;
  const signal: number[] = [];
  const timestamps: number[] = [];
  let t = 0;
  for (const ibi of ibiSequenceMs) {
    const steps = Math.max(1, Math.round(ibi / dt));
    for (let s = 0; s < steps; s++) {
      const phase = (s / steps) * 2 * Math.PI;
      signal.push(Math.sin(phase));
      timestamps.push(t);
      t += dt;
    }
  }
  return { signal, timestamps };
}

describe('HrvEstimator diagnostics behaviour', () => {
  it('stable IBIs produce reasonable RMSSD and diag arrays', () => {
    const ibis = new Array(12).fill(1000);
    const { signal, timestamps } = makePulseWithIbis(ibis, 60);
    const res = HrvEstimator.analyze(signal, timestamps, 0.95);
    expect(res.hrvValid).toBe(true);
    expect(res.diag).toBeDefined();
    expect(res.diag?.rawIBIsMs.length).toBeGreaterThanOrEqual(10);
    expect(res.diag?.deltaIBIs.length).toBeGreaterThanOrEqual(4);
    expect(res.rmssd).toBeGreaterThanOrEqual(0);
  });

  it('one large erroneous IBI produces large RMSSD and is visible in diag', () => {
    // Use 1400ms (within physiological gate <=1500ms) to ensure it is included
    const ibis = [1000, 1000, 1000, 1400, 1000, 1000, 1000, 1000, 1000];
    const { signal, timestamps } = makePulseWithIbis(ibis, 60);
    const res = HrvEstimator.analyze(signal, timestamps, 0.95);
    // Compare to a stable baseline to ensure RMSSD increases with the error
    const { signal: baseSig, timestamps: baseTs } = makePulseWithIbis(new Array(9).fill(1000), 60);
    const baseRes = HrvEstimator.analyze(baseSig, baseTs, 0.95);
    expect(res.diag).toBeDefined();
    expect(res.diag?.maxAbsDeltaIbi).toBeGreaterThan(baseRes.diag?.maxAbsDeltaIbi || 0);
    expect(res.rmssd).toBeGreaterThan(baseRes.rmssd);
  });

  it('rejected IBIs are excluded from RMSSD calculation', () => {
    // include a very short ibi (200ms) that will be physiologically rejected
    const ibis = [1000, 1000, 200, 1000, 1000, 1000, 1000, 1000, 1000];
    const { signal, timestamps } = makePulseWithIbis(ibis, 60);
    const res = HrvEstimator.analyze(signal, timestamps, 0.95);
    expect(res.rejectedIBIs).toBeGreaterThanOrEqual(1);
    // Ensure RMSSD computed on validIBIsMs (if valid) does not include 200ms
    if (res.hrvValid) {
      expect(res.diag?.rawIBIsMs.includes(200)).toBe(false);
    }
  });

  it('insufficient valid IBIs rejects HRV', () => {
    // only 1 IBI -> fewer than MIN_VALID_IBIS=2, so HRV is rejected
    const ibis = [1000];
    const { signal, timestamps } = makePulseWithIbis(ibis, 60);
    const res = HrvEstimator.analyze(signal, timestamps, 0.95);
    expect(res.hrvValid).toBe(false);
    expect(res.rejectionReason).toBeDefined();
  });

  it('irregular timestamps produce diag with sample rate reported', () => {
    const ibis = new Array(12).fill(1000);
    const { signal, timestamps } = makePulseWithIbis(ibis, 30);
    // add jitter
    const jittered = timestamps.map((t, i) => t + ((i * 13) % 7) - 3);
    const res = HrvEstimator.analyze(signal, jittered, 0.95);
    expect(res.diag).toBeDefined();
    expect(res.diag?.effectiveSampleRateHz).toBeGreaterThan(20);
  });
});

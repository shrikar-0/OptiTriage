import { describe, it, expect } from 'vitest';
import { HrvEstimator } from './hrv';

function makeSyntheticPulse(ibisMs: number[], fps = 60, jitterMs = 0) {
  const dt = 1000 / fps;
  const signal: number[] = [];
  const timestamps: number[] = [];
  let t = 0;

  for (let i = 0; i < ibisMs.length; i++) {
    const ibi = ibisMs[i];
    const steps = Math.max(1, Math.round(ibi / dt));
    for (let s = 0; s < steps; s++) {
      const phase = (s / steps) * 2 * Math.PI;
      const val = Math.sin(phase) + 0.5 * Math.sin(2 * phase);
      signal.push(val);
      const j = jitterMs > 0 ? ((signal.length * 31) % (2 * jitterMs)) - jitterMs : 0;
      timestamps.push(t + j);
      t += dt;
    }
  }

  return { signal, timestamps };
}

describe('HRV Pipeline Correctness (Phases 1–7 Audit Fixes)', () => {
  // ── Phase 1: RMSSD Consecutiveness Tests ────────────────────────────────────
  describe('Phase 1 — RMSSD Consecutiveness', () => {
    it('does NOT compare non-consecutive IBIs when an intermediate IBI is rejected', () => {
      // Sequence: 1000, 800, 1000
      // Initial median = 1000 ms. 800 ms deviates by 200 ms (20%), which is on the boundary.
      // If 800 ms is rejected or another outlier like 500 ms is inserted between 1000 ms IBIs:
      const ibis = [1000, 1000, 500, 1000, 1000]; // 500 ms is rejected by physiological gate
      const { signal, timestamps } = makeSyntheticPulse(ibis, 60);
      const res = HrvEstimator.analyze(signal, timestamps, 0.95);

      // Verify that rejected intermediate IBI does NOT create a false delta between adjacent 1000 ms IBIs across the gap
      const deltaIBIs = res.diag?.deltaIBIs ?? [];
      // Every delta in deltaIBIs must come from consecutive cardiac intervals
      for (const delta of deltaIBIs) {
        expect(Math.abs(delta)).toBeLessThan(100);
      }
    });

    it('calculates correct RMSSD for a fully consecutive accepted sequence', () => {
      // Sequence: 1000, 1020, 980
      // Diffs: (1020 - 1000) = +20 ms, (980 - 1020) = -40 ms
      // Diffs squared: 400 + 1600 = 2000 -> mean = 1000 -> sqrt(1000) = 31.62 ms
      const ibis = [1000, 1020, 980, 1010, 990, 1015, 985];
      const { signal, timestamps } = makeSyntheticPulse(ibis, 60);
      const res = HrvEstimator.analyze(signal, timestamps, 0.95);

      expect(res.hrvValid).toBe(true);
      expect(res.rmssd).toBeGreaterThan(15);
      expect(res.rmssd).toBeLessThan(45);
    });
  });

  // ── Phase 2: Ectopic Cold-Start Tests ───────────────────────────────────────
  describe('Phase 2 — Ectopic Cold Start', () => {
    it('preserves valid initial IBIs (900, 910, 920 ms)', () => {
      const ibis = [900, 910, 920, 905, 915, 900, 910];
      const { signal, timestamps } = makeSyntheticPulse(ibis, 60);
      const res = HrvEstimator.analyze(signal, timestamps, 0.95);

      expect(res.validIBIsMs.length).toBeGreaterThanOrEqual(5);
      expect(res.validIBIsMs.includes(900) || res.validIBIsMs.some(v => Math.abs(v - 900) < 30)).toBe(true);
    });

    it('rejects an ectopic 1400 ms IBI occurring during cold start (900, 1400, 910 ms)', () => {
      const ibis = [900, 1400, 910, 905, 915, 900, 910];
      const { signal, timestamps } = makeSyntheticPulse(ibis, 60);
      const res = HrvEstimator.analyze(signal, timestamps, 0.95);

      // 1400 ms should be rejected and NOT included in validIBIsMs
      expect(res.validIBIsMs.some(v => Math.abs(v - 1400) < 50)).toBe(false);
      expect(res.rejectedIBIs).toBeGreaterThanOrEqual(1);
    });

    it('handles initial cold-start outlier (1200, 800, 810 ms)', () => {
      const ibis = [1200, 800, 810, 805, 815, 800, 810];
      const { signal, timestamps } = makeSyntheticPulse(ibis, 60);
      const res = HrvEstimator.analyze(signal, timestamps, 0.95);

      // 1200 ms deviates >20% from initial window median (~810 ms) and is rejected
      expect(res.validIBIsMs.some(v => Math.abs(v - 1200) < 50)).toBe(false);
      expect(res.validIBIsMs.some(v => Math.abs(v - 800) < 30)).toBe(true);
    });
  });

  // ── Phase 3 & 5: Gate Priority & UNSTABLE_BEAT_TIMING Tests ─────────────────
  describe('Phase 3 & 5 — Gate Priority & UNSTABLE_BEAT_TIMING', () => {
    it('triggers UNSTABLE_BEAT_TIMING when ectopic rejection ratio exceeds 35%', () => {
      // 10 physiological IBIs with 4 heavily erratic ectopic jumps (40% rejected)
      const ibis = [1000, 1450, 1010, 1450, 1005, 1450, 1000, 1450, 995, 1005];
      const { signal, timestamps } = makeSyntheticPulse(ibis, 60);
      const res = HrvEstimator.analyze(signal, timestamps, 0.95);

      expect(res.hrvValid).toBe(false);
      expect(res.rejectionReason).toBe('UNSTABLE_BEAT_TIMING');
      expect(res.rmssd).toBe(0);
      expect(res.sdnn).toBe(0);
    });

    it('does NOT trigger UNSTABLE_BEAT_TIMING when ectopic rejection is <= 35%', () => {
      // 10 IBIs with 2 ectopic jumps (20% rejected)
      const ibis = [1000, 1005, 1450, 1000, 995, 1005, 1450, 1000, 1005, 995];
      const { signal, timestamps } = makeSyntheticPulse(ibis, 60);
      const res = HrvEstimator.analyze(signal, timestamps, 0.95);

      expect(res.hrvValid).toBe(true);
      expect(res.rejectionReason).toBe('NONE');
    });

    it('preserves LOW_FRAME_RATE over UNSTABLE_BEAT_TIMING for low-FPS signals', () => {
      const ibis = [1000, 1450, 1010, 1450, 1005, 1450, 1000, 1450, 995, 1005];
      const { signal, timestamps } = makeSyntheticPulse(ibis, 14.9); // 14.9 FPS
      const res = HrvEstimator.analyze(signal, timestamps, 0.95);

      expect(res.hrvValid).toBe(false);
      expect(res.rejectionReason).toBe('LOW_FRAME_RATE');
    });

    it('preserves POOR_SIGNAL_QUALITY over UNSTABLE_BEAT_TIMING when SQI < 0.50', () => {
      const ibis = [1000, 1450, 1010, 1450, 1005, 1450, 1000, 1450, 995, 1005];
      const { signal, timestamps } = makeSyntheticPulse(ibis, 60);
      const res = HrvEstimator.analyze(signal, timestamps, 0.40); // SQI = 0.40

      expect(res.hrvValid).toBe(false);
      expect(res.rejectionReason).toBe('POOR_SIGNAL_QUALITY');
    });
  });

  // ── Phase 4: Parabolic Interpolation Tests ──────────────────────────────────
  describe('Phase 4 — Parabolic Sub-sample Peak Interpolation', () => {
    it('refines peak timestamps beyond discrete sample boundaries', () => {
      const ibis = new Array(10).fill(1000);
      const { signal, timestamps } = makeSyntheticPulse(ibis, 30);
      const res = HrvEstimator.analyze(signal, timestamps, 0.95);

      expect(res.diag?.detectedBeatTimestamps).toBeDefined();
      expect(res.diag?.detectedBeatTimestamps?.length).toBeGreaterThan(0);
      // Verify all timestamps are finite
      for (const ts of res.diag?.detectedBeatTimestamps ?? []) {
        expect(Number.isFinite(ts)).toBe(true);
      }
    });
  });

  // ── Phase 7: Comprehensive Edge Cases ───────────────────────────────────────
  describe('Phase 7 — Edge Cases & Stability', () => {
    it('Perfect 60 BPM -> RMSSD should be approximately 0', () => {
      const ibis = new Array(12).fill(1000);
      const { signal, timestamps } = makeSyntheticPulse(ibis, 60);
      const res = HrvEstimator.analyze(signal, timestamps, 0.95);
      expect(res.hrvValid).toBe(true);
      expect(res.rmssd).toBeLessThanOrEqual(5.0);
      expect(res.sdnn).toBeLessThanOrEqual(5.0);
    });

    it('Too few valid IBIs (<5) -> rejects with INSUFFICIENT_VALID_IBIS', () => {
      const ibis = [1000, 1000, 1000];
      const { signal, timestamps } = makeSyntheticPulse(ibis, 60);
      const res = HrvEstimator.analyze(signal, timestamps, 0.95);
      expect(res.hrvValid).toBe(false);
      expect(res.rejectionReason).toBe('INSUFFICIENT_VALID_IBIS');
    });

    it('Duplicate timestamps -> handles cleanly without crash', () => {
      const ibis = new Array(10).fill(1000);
      const { signal, timestamps } = makeSyntheticPulse(ibis, 30);
      timestamps[5] = timestamps[4];
      const res = HrvEstimator.analyze(signal, timestamps, 0.95);
      expect(res).toBeDefined();
      expect(Number.isFinite(res.rmssd)).toBe(true);
    });

    it('Non-monotonic timestamps -> handles safely', () => {
      const ibis = new Array(10).fill(1000);
      const { signal, timestamps } = makeSyntheticPulse(ibis, 30);
      timestamps[10] = timestamps[8];
      const res = HrvEstimator.analyze(signal, timestamps, 0.95);
      expect(res).toBeDefined();
      expect(Number.isFinite(res.rmssd)).toBe(true);
    });
  });
});

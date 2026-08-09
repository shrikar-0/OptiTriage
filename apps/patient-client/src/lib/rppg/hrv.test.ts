import { describe, it, expect } from 'vitest';
import { HrvEstimator, IBI_MIN_MS } from './hrv';

describe('HrvEstimator', () => {
  it('should return INSUFFICIENT_DATA for empty or short signals', () => {
    const res = HrvEstimator.analyze([], [], 1.0);
    expect(res.hrvValid).toBe(false);
    expect(res.rejectionReason).toBe('INSUFFICIENT_DATA');
    expect(res.rmssd).toBe(0);
  });

  it('should return POOR_SIGNAL_QUALITY when SQI is below threshold', () => {
    // Generate 10s synthetic pulse at 60 FPS (600 samples)
    const fps = 60;
    const durationSec = 10;
    const n = fps * durationSec;
    const signal: number[] = [];
    const timestamps: number[] = [];

    for (let i = 0; i < n; i++) {
      const t = (i / fps) * 1000; // ms
      // 1 Hz sinus (60 BPM)
      signal.push(Math.sin((2 * Math.PI * i) / fps));
      timestamps.push(t);
    }

    const res = HrvEstimator.analyze(signal, timestamps, 0.3); // SQI = 0.3 < MIN_HRV_SQI (0.5)
    expect(res.hrvValid).toBe(false);
    expect(res.rejectionReason).toBe('POOR_SIGNAL_QUALITY');
    expect(res.rmssd).toBe(0);
  });

  it('should detect beats, IBIs, and calculate non-zero RMSSD for a physiological signal with natural variation', () => {
    const fps = 60;
    const sampleDtMs = 1000 / fps;
    const signal: number[] = [];
    const timestamps: number[] = [];

    // Simulate 10 beats with slightly varying inter-beat intervals:
    // IBIs ~ 1000ms ± 30ms (60 BPM nominal with HRV)
    const targetIbisMs = [1000, 970, 1030, 980, 1020, 990, 1010, 975, 1025];
    let currentT = 0;

    for (let b = 0; b < targetIbisMs.length; b++) {
      const ibi = targetIbisMs[b];
      const steps = Math.round(ibi / sampleDtMs);
      for (let s = 0; s < steps; s++) {
        const phase = (s / steps) * 2 * Math.PI;
        // Pulse waveform with a sharp systolic peak
        const val = Math.sin(phase) + 0.5 * Math.sin(2 * phase);
        signal.push(val);
        timestamps.push(currentT);
        currentT += sampleDtMs;
      }
    }

    const res = HrvEstimator.analyze(signal, timestamps, 0.95);
    expect(res.hrvValid).toBe(true);
    expect(res.rejectionReason).toBe('NONE');
    expect(res.detectedBeats).toBeGreaterThanOrEqual(6);
    expect(res.validIBIs).toBeGreaterThanOrEqual(5);
    expect(res.rmssd).toBeGreaterThan(0);
    expect(res.sdnn).toBeGreaterThan(0);
    expect(res.meanIBI).toBeCloseTo(1000, -2); // ~1000 ms
    expect(res.heartRateFromIbi).toBeCloseTo(60, 0); // ~60 BPM
  });

  it('should filter ectopic / implausible IBIs correctly', () => {
    const fps = 60;
    const sampleDtMs = 1000 / fps;
    const signal: number[] = [];
    const timestamps: number[] = [];

    // IBIs: 1000ms, 1000ms, 200ms (double-beat artifact!), 1000ms, 1000ms, 1000ms, 1000ms
    const targetIbisMs = [1000, 1000, 200, 1000, 1000, 1000, 1000, 1000];
    let currentT = 0;

    for (let b = 0; b < targetIbisMs.length; b++) {
      const ibi = targetIbisMs[b];
      const steps = Math.round(ibi / sampleDtMs);
      for (let s = 0; s < steps; s++) {
        const phase = (s / steps) * 2 * Math.PI;
        const val = Math.sin(phase);
        signal.push(val);
        timestamps.push(currentT);
        currentT += sampleDtMs;
      }
    }

    const res = HrvEstimator.analyze(signal, timestamps, 0.9);
    // The 200ms IBI is below IBI_MIN_MS (333ms) and should be rejected by the physiological gate
    expect(res.rejectedIBIs).toBeGreaterThanOrEqual(1);
    expect(res.minIBI).toBeGreaterThanOrEqual(IBI_MIN_MS);
  });
});

import { describe, it, expect } from 'vitest';
import { RespiratoryRateEstimator, resampleSignalUniformly } from './opticalFlow';

describe('resampleSignalUniformly', () => {
  it('should return null for insufficient samples (<2)', () => {
    expect(resampleSignalUniformly([1], [100])).toBeNull();
    expect(resampleSignalUniformly([], [])).toBeNull();
  });

  it('should resample perfectly uniform timestamps to a uniform grid', () => {
    const fps = 30;
    const dt = 1000 / fps;
    const signal: number[] = [];
    const timestamps: number[] = [];
    for (let i = 0; i < 300; i++) {
      signal.push(Math.sin((2 * Math.PI * i) / 30));
      timestamps.push(i * dt);
    }

    const res = resampleSignalUniformly(signal, timestamps);
    expect(res).not.toBeNull();
    expect(res!.targetFs).toBe(30);
    expect(res!.originalCount).toBe(300);
    expect(res!.hasGap).toBe(false);
    expect(res!.signal.length).toBeGreaterThan(0);
  });

  it('should resample realistic mobile timestamp jitter (~9.3 FPS) onto a uniform grid', () => {
    const signal: number[] = [];
    const timestamps: number[] = [];
    let t = 0;
    for (let i = 0; i < 100; i++) {
      signal.push(Math.cos(2 * Math.PI * 0.33 * (t / 1000)));
      timestamps.push(t);
      const jitter = ((i * 17) % 51) - 25; // [-25, +25] ms jitter around 107ms (9.3 FPS)
      t += 107 + jitter;
    }

    const res = resampleSignalUniformly(signal, timestamps);
    expect(res).not.toBeNull();
    expect(res!.targetFs).toBe(30);
    expect(res!.dtMeanMs).toBeGreaterThan(80);
    expect(res!.dtStdMs).toBeGreaterThan(0);
    expect(res!.hasGap).toBe(false);
    expect(res!.resampledCount).toBeGreaterThan(100);
  });

  it('should detect large timestamp gaps (>2.0s)', () => {
    const signal = [0, 1, 0, 1, 0, 1];
    const timestamps = [0, 100, 200, 3000, 3100, 3200];
    const res = resampleSignalUniformly(signal, timestamps);
    expect(res).not.toBeNull();
    expect(res!.hasGap).toBe(true);
  });
});

describe('RespiratoryRateEstimator (Time-based Buffer)', () => {
  it('should mark buffer as full only after ~10 seconds of timestamps, regardless of FPS', () => {
    const estimator = new RespiratoryRateEstimator();
    const fps = 15; // Realistic 15 FPS
    const dt = 1000 / fps;

    let t = 0;
    // Push 5 seconds of data (75 frames)
    for (let i = 0; i < 5 * fps; i++) {
      estimator.push(Math.sin(2 * Math.PI * 0.25 * (t / 1000)), t);
      t += dt;
    }

    expect(estimator.isBufferFull).toBe(false);
    expect(estimator.rawBufferLength).toBe(75);

    // Push until 10 seconds (150 frames total)
    for (let i = 5 * fps; i <= 10 * fps; i++) {
      estimator.push(Math.sin(2 * Math.PI * 0.25 * (t / 1000)), t);
      t += dt;
    }

    expect(estimator.isBufferFull).toBe(true);
    expect(estimator.rawBufferLength).toBeGreaterThanOrEqual(145);
    expect(estimator.rawBufferLength).toBeLessThanOrEqual(155);
  });

  it('should estimate respiratory rate for a synthetic 15 brpm (0.25 Hz) oscillation at 15 FPS', () => {
    const estimator = new RespiratoryRateEstimator();
    const fps = 15;
    const dt = 1000 / fps;
    const targetBrpm = 15; // 0.25 Hz
    const freq = targetBrpm / 60;

    let t = 0;
    // Push 25 seconds so rrHistory accumulates after the initial 10-second fill.
    // Amplitude 0.05 px is representative of a real chest-motion signal and clears
    // the MIN_RESP_RMS / MIN_RESP_P2P gates.
    for (let i = 0; i < 25 * fps; i++) {
      const signal = 0.05 * Math.sin(2 * Math.PI * freq * (t / 1000));
      estimator.push(signal, t);
      t += dt;
    }

    expect(estimator.isBufferFull).toBe(true);
    // rrHistory must have grown (signal energy + spectral gates pass)
    expect(estimator.rrHistoryLength).toBeGreaterThan(0);
    const rr = estimator.getRespRate();
    expect(rr).toBeGreaterThanOrEqual(13);
    expect(rr).toBeLessThanOrEqual(17);
  });

  it('should accurately estimate a synthetic respiratory signal around 0.33 Hz (20 BPM) with ~9.3 FPS mobile jitter', () => {
    const estimator = new RespiratoryRateEstimator();
    const targetFreqHz = 0.333; // 20 BPM
    let t = 0;
    let frameCount = 0;

    while (t < 15000) { // 15 seconds
      const signal = 0.05 * Math.sin(2 * Math.PI * targetFreqHz * (t / 1000));
      estimator.push(signal, t);
      frameCount++;
      const jitter = ((frameCount * 31) % 45) - 22; // [-22, +22] ms jitter around 107 ms
      t += 107 + jitter;
    }

    expect(estimator.isBufferFull).toBe(true);
    const stats = estimator.computeSpectralStats();
    expect(stats.isValid).toBe(true);
    expect(stats.peakPowerRatio).toBeGreaterThan(0.050); // Uniform resampling sharpens power ratio from 0.024 to 0.097 (well above 0.050 threshold)!
    expect(stats.peakFrequency).toBeCloseTo(0.333, 1);
    expect(stats.rr).toBeGreaterThanOrEqual(18);
    expect(stats.rr).toBeLessThanOrEqual(22);
  });

  it('should reject low-amplitude noise (breath hold) and output 0 RR', () => {
    const estimator = new RespiratoryRateEstimator();
    const fps = 30;
    const dt = 1000 / fps;

    let t = 0;
    // Push 15 seconds of low-amplitude sensor noise (amplitude 0.003 px)
    for (let i = 0; i < 15 * fps; i++) {
      const noise = 0.003 * (Math.random() - 0.5);
      estimator.push(noise, t);
      t += dt;
    }

    expect(estimator.isBufferFull).toBe(true);
    const stats = estimator.computeSpectralStats();
    expect(stats.isValid).toBe(false);
    expect(stats.signalQuality).toBe('LOW');
    expect(estimator.getRespRate()).toBe(0);
    expect(estimator.getRespRateRaw()).toBe(0);
    expect(estimator.rrHistoryLength).toBe(0);
  });

  it('should accurately estimate synthetic 10, 15, and 20 brpm signals', () => {
    for (const targetBrpm of [10, 15, 20]) {
      const estimator = new RespiratoryRateEstimator();
      const fps = 30;
      const dt = 1000 / fps;
      const freq = targetBrpm / 60;

      let t = 0;
      for (let i = 0; i < 15 * fps; i++) {
        const signal = 0.05 * Math.sin(2 * Math.PI * freq * (t / 1000));
        estimator.push(signal, t);
        t += dt;
      }

      expect(estimator.isBufferFull).toBe(true);
      const stats = estimator.computeSpectralStats();
      expect(stats.isValid).toBe(true);
      const rr = estimator.getRespRate();
      expect(rr).toBeGreaterThanOrEqual(targetBrpm - 2);
      expect(rr).toBeLessThanOrEqual(targetBrpm + 2);
    }
  });

  it('should clear buffer and state on reset()', () => {
    const estimator = new RespiratoryRateEstimator();
    let t = 0;
    for (let i = 0; i < 200; i++) {
      estimator.push(1.0, t);
      t += 50;
    }

    expect(estimator.rawBufferLength).toBeGreaterThan(0);
    estimator.reset();
    expect(estimator.rawBufferLength).toBe(0);
    expect(estimator.filteredBufferLength).toBe(0);
    expect(estimator.rrHistoryLength).toBe(0);
    expect(estimator.isBufferFull).toBe(false);
  });
});

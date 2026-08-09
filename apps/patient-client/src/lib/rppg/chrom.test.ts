import { describe, it, expect } from 'vitest';
import { ChromProcessor } from './chrom';
import type { RgbSample } from '../types/rppg';

describe('CHROM Algorithm', () => {
  it('should extract a pure pulse signal from a synthetic RGB waveform with noise', () => {
    const fps = 60;
    const durationSec = 10;
    const frames = fps * durationSec;

    // Synthetic heart rate: 75 BPM -> 1.25 Hz
    const fPulse = 1.25;

    const skinWindow: RgbSample[] = [];

    for (let i = 0; i < frames; i++) {
      const t = i / fps;
      // Pulse component (hemoglobin absorption is highest in Green)
      const pulse = 0.05 * Math.sin(2 * Math.PI * fPulse * t);
      // Specular noise (motion/lighting artifacts affect all channels equally)
      const noise = 0.1 * Math.sin(2 * Math.PI * 0.5 * t);

      // Simulate base skin tone and pulse effect across channels
      skinWindow.push({
        r: 0.8 + noise - pulse * 0.1, // Red has little absorption
        g: 0.6 + noise - pulse, // Green has max absorption
        b: 0.5 + noise - pulse * 0.2, // Blue has some absorption
        timestamp: t * 1000,
      });
    }

    const signal = ChromProcessor.processWindow(skinWindow);

    expect(signal.length).toBe(frames);

    // The signal should not be entirely zeros
    const allZeros = signal.every((val) => val === 0);
    expect(allZeros).toBe(false);

    // Basic zero-crossing frequency estimation to verify it kept the 1.25Hz pulse
    let zeroCrossings = 0;
    for (let i = 1; i < signal.length; i++) {
      if ((signal[i - 1] > 0 && signal[i] < 0) || (signal[i - 1] < 0 && signal[i] > 0)) {
        zeroCrossings++;
      }
    }

    // Number of cycles = zeroCrossings / 2
    // Frequency = cycles / duration
    const estimatedFreq = zeroCrossings / 2 / durationSec;

    console.log('Zero crossings:', zeroCrossings);
    console.log('Signal head:', signal.slice(0, 10));

    // Should be close to 1.25 Hz
    expect(estimatedFreq).toBeCloseTo(fPulse, 1);
  });
});

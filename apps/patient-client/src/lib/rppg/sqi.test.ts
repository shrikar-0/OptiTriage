import { describe, it, expect } from 'vitest';
import { SQIEngine } from './sqi';

function makeMotionRoi(timestamp: number, offset = 0) {
  return {
    torso: { xMin: 0.3 + offset, yMin: 0.5, xMax: 0.4 + offset, yMax: 0.7 },
    landmarks: [
      { x: 0.3 + offset, y: 0.5 },
      { x: 0.4 + offset, y: 0.5 },
      { x: 0.35 + offset, y: 0.6 },
      { x: 0.3 + offset, y: 0.65 },
    ],
    timestamp,
  };
}

describe('SQIEngine', () => {
  it('should return 1.0 on the first frame and maintain high SQI for stable low-motion frames', () => {
    const engine = new SQIEngine();

    const first = engine.evaluate(makeMotionRoi(0));
    expect(first).toBe(1.0);

    const second = engine.evaluate(makeMotionRoi(1000));
    expect(second).toBeGreaterThan(0.9);

    const third = engine.evaluate(makeMotionRoi(1200, 0.001));
    expect(third).toBeGreaterThan(0.8);
  });

  it('should keep SQI high across variable frame intervals without false motion inflation', () => {
    const engine = new SQIEngine();

    engine.evaluate(makeMotionRoi(0));
    const lowFpsResult = engine.evaluate(makeMotionRoi(1000));
    expect(lowFpsResult).toBeGreaterThan(0.9);

    const fastFpsResult = engine.evaluate(makeMotionRoi(1040));
    expect(fastFpsResult).toBeGreaterThan(0.9);
  });
});

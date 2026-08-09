import type { MotionRoi } from '../types/roi';

/**
 * Multi-Factor Signal Quality Index (SQI) Engine.
 * Evaluates rPPG signal quality based on global motion velocity, landmark jitter,
 * bounding box shape deformation, and acceleration spikes.
 */
export class SQIEngine {
  private lastMotionRoi: MotionRoi | null = null;
  private lastVelocity = 0;

  private velocityHistory: number[] = [];
  private jitterHistory: number[] = [];
  private shapeHistory: number[] = [];
  private accelHistory: number[] = [];

  private readonly WINDOW_SIZE = 30; // 0.5 s rolling window at 60 fps

  /**
   * Evaluates the multi-factor Signal Quality Index in the range [0, 1].
   * Returns 0 if currentMotionRoi is missing or undefined.
   */
  public evaluate(currentMotionRoi: MotionRoi | undefined): number {
    if (!currentMotionRoi) return 0;

    if (!this.lastMotionRoi) {
      this.lastMotionRoi = currentMotionRoi;
      return 1.0; // Assume optimal quality on first frame
    }

    const prevTorso = this.lastMotionRoi.torso;
    const currTorso = currentMotionRoi.torso;

    const dtMs = Math.max(1, currentMotionRoi.timestamp - this.lastMotionRoi.timestamp);
    const frameNormalization = 16.6667 / dtMs; // normalize variable-frame intervals to 60 fps equivalent

    // 1. Global Velocity Metric (Center Translation)
    const currentCenterX = (currTorso.xMin + currTorso.xMax) / 2;
    const currentCenterY = (currTorso.yMin + currTorso.yMax) / 2;
    const lastCenterX = (prevTorso.xMin + prevTorso.xMax) / 2;
    const lastCenterY = (prevTorso.yMin + prevTorso.yMax) / 2;

    const dx = currentCenterX - lastCenterX;
    const dy = currentCenterY - lastCenterY;
    const velocity = Math.sqrt(dx * dx + dy * dy) * frameNormalization;

    // 2. Acceleration / Jerk Metric
    const accel = Math.abs(velocity - this.lastVelocity);
    this.lastVelocity = velocity;

    // 3. Shape Deformation Metric (Bounding box width/height variation)
    const prevW = prevTorso.xMax - prevTorso.xMin;
    const prevH = prevTorso.yMax - prevTorso.yMin;
    const currW = currTorso.xMax - currTorso.xMin;
    const currH = currTorso.yMax - currTorso.yMin;
    const shapeChange = (Math.abs(currW - prevW) + Math.abs(currH - prevH)) * frameNormalization;

    // 4. Landmark Jitter Metric (Relative motion deviation across landmarks)
    let jitter = 0;
    const prevLm = this.lastMotionRoi.landmarks;
    const currLm = currentMotionRoi.landmarks;

    if (prevLm && currLm && prevLm.length > 0 && prevLm.length === currLm.length) {
      let sumJitter = 0;
      for (let i = 0; i < currLm.length; i++) {
        // Individual landmark movement minus global center displacement
        const lmDx = currLm[i].x - prevLm[i].x - dx;
        const lmDy = currLm[i].y - prevLm[i].y - dy;
        sumJitter += Math.sqrt(lmDx * lmDx + lmDy * lmDy);
      }
      jitter = (sumJitter / currLm.length) * frameNormalization;
    }

    // Push into rolling buffers
    this.velocityHistory.push(velocity);
    this.jitterHistory.push(jitter);
    this.shapeHistory.push(shapeChange);
    this.accelHistory.push(accel);

    if (this.velocityHistory.length > this.WINDOW_SIZE) {
      this.velocityHistory.shift();
      this.jitterHistory.shift();
      this.shapeHistory.shift();
      this.accelHistory.shift();
    }

    this.lastMotionRoi = currentMotionRoi;

    // Compute rolling averages
    const avgVelocity = mean(this.velocityHistory);
    const avgJitter = mean(this.jitterHistory);
    const avgShape = mean(this.shapeHistory);
    const avgAccel = mean(this.accelHistory);

    // Normalize each quality component to [0, 1] using clinical thresholds
    const MAX_VELOCITY = 0.04; // 4% frame displacement per frame
    const MAX_JITTER = 0.015;  // 1.5% relative landmark deviation
    const MAX_SHAPE = 0.02;    // 2% box deformation
    const MAX_ACCEL = 0.02;    // 2% velocity spike

    const qVel = Math.max(0, 1 - avgVelocity / MAX_VELOCITY);
    const qJitter = Math.max(0, 1 - avgJitter / MAX_JITTER);
    const qShape = Math.max(0, 1 - avgShape / MAX_SHAPE);
    const qAccel = Math.max(0, 1 - avgAccel / MAX_ACCEL);

    // Weighted combination (Sum of weights = 1.0)
    // 35% Velocity, 30% Landmark Jitter, 20% Shape Deformation, 15% Acceleration
    const compositeSQI =
      0.35 * qVel +
      0.30 * qJitter +
      0.20 * qShape +
      0.15 * qAccel;

    return Math.max(0, Math.min(1, compositeSQI));
  }

  public reset(): void {
    this.lastMotionRoi = null;
    this.lastVelocity = 0;
    this.velocityHistory = [];
    this.jitterHistory = [];
    this.shapeHistory = [];
    this.accelHistory = [];
  }
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

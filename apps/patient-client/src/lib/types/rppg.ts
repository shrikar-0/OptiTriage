import type { HrvRejectionReason, HrvResult } from '../rppg/hrv';

export interface RppgHrvDiag {
  signalLength?: number;
  windowDurationMs?: number;
  effectiveSampleRateHz?: number;
  sigMin?: number;
  sigMax?: number;
  sigMean?: number;
  sigStd?: number;
  sigRms?: number;
  minRefractorySamples?: number;
  candidatePeaks?: number[];
  acceptedPeaks?: number[];
  peakAmplitudes?: number[];
  rejectedPeakCount?: number;
  detectedBeatIndices?: number[];
  detectedBeatTimestamps?: number[];
  rawIBIsMs?: number[];
  physiologicalIBIsMs?: number[];
  validIBIsMs?: number[];
  rejectedIBIsMs?: number[];
  deltaIBIs?: number[];
  ibiStd?: number;
  maxAbsDeltaIbi?: number;
  rmssdValuesUsed?: number[];
}

export interface RppgMetrics {
  bpm: number;
  hrv: number; // RR-interval variability in milliseconds
  hrvValid: boolean;
  sqi: number; // Signal Quality Index (0.0 to 1.0)
  valid: boolean;
  timestamp: number;
  rejectionReason?: HrvRejectionReason;
  detectedBeats?: number;
  validIBIs?: number;
  rejectedIBIs?: number;
  meanIBI?: number;
  minIBI?: number;
  maxIBI?: number;
  rmssd?: number;
  sdnn?: number;
  heartRateFromIbi?: number;
  hrvDiag?: RppgHrvDiag;
  // rPPG instrumentation
  rppgFrameCount?: number;
  rppgBufferLength?: number;
  rppgBufferDurationMs?: number;
  rppgMeasuredFps?: number;
  rppgTimestampDtMin?: number;
  rppgTimestampDtMax?: number;
  rppgTimestampDtMean?: number;
  rppgTimestampDtStd?: number;
  pulseStd?: number;
  pulseP2P?: number;
  // NEW DIAGNOSTICS:
  cameraFps?: number;
  cameraFrameCount?: number;
  cameraTimestampDtMean?: number;
  cameraTimestampDtStd?: number;
  
  dispatchFramesReceived?: number;
  dispatchFramesSent?: number;
  dispatchFramesSkipped?: number;
  dispatchFps?: number;
  dispatchAvgInterval?: number;
  dispatchMaxGap?: number;
  
  bitmapAvgTime?: number;
  bitmapMaxTime?: number;
  bitmapFailures?: number;
  
  workerProcessFramesReceived?: number;
  workerProcessFramesCompleted?: number;
  workerProcessAvgTime?: number;
  workerProcessMaxTime?: number;
  workerProcessFps?: number;
}

export interface RgbSample {
  r: number;
  g: number;
  b: number;
  timestamp: number;
}

import type { MotionRoi } from './roi';

export interface RppgWorkerMessageIn {
  type: 'PROCESS_FRAME';
  bitmap: ImageBitmap;
  /** Left cheek bounding box (normalized 0–1 coords) for bilateral rPPG extraction */
  leftCheekRoi: { xMin: number; yMin: number; xMax: number; yMax: number };
  /** Right cheek bounding box (normalized 0–1 coords) for bilateral rPPG extraction */
  rightCheekRoi: { xMin: number; yMin: number; xMax: number; yMax: number };
  motionRoi: MotionRoi;
  timestamp: number;
}

export interface RppgWorkerMessageOut {
  type: 'METRICS' | 'ERROR' | 'READY';
  payload?: RppgMetrics;
  error?: string;
}

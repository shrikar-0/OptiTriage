/**
 * motion.worker.ts — OptiTriage Motion Lane
 *
 * This is a MODULE worker (`{ type: 'module' }`).  OpenCV.js is loaded via
 * the `@techstark/opencv-js` npm package (ESM build) instead of the CDN
 * importScripts() call, which is only valid in classic workers.
 *
 * Responsibilities:
 *   1. Await the @techstark/opencv-js ready promise (WASM init) at startup.
 *   2. Use cv.calcOpticalFlowPyrLK (sparse Lucas-Kanade) to track the
 *      landmark points supplied in each PROCESS_FRAME message.
 *   3. Extract respiratory rate from vertical displacement in the torso ROI.
 *   4. Extract the motionAsymmetryFlag feature vector from facial flow.
 *   5. Gate both outputs behind the SQI forwarded from the rPPG worker.
 *
 * Privacy guarantee: ImageBitmap is transferred (zero-copy) into this worker,
 * decoded to pixel data locally, and destroyed here.  No image or video bytes
 * leave this worker — only numeric JSON is posted back.
 *
 * OpenCV type stubs: @techstark/opencv-js ships its own TypeScript types so
 * we import `cv` as `any` only to avoid the full opencv type surface; the
 * runtime object is identical to the browser OpenCV.js API.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { MotionWorkerMessageIn, MotionWorkerMessageOut, MotionMetrics, RrDiagSnapshot } from '../types/motion';
import { RespiratoryRateEstimator, MotionAsymmetryTracker } from '../motion/opticalFlow';

type WorkerState = 'loading' | 'ready' | 'failed' | 'destroyed';

/** The awaited OpenCV cv object — populated at module init time. */
let cv: any = null;
let openCVInitError: string | null = null;
let workerState: WorkerState = 'loading';
const workerInstanceId = Math.random().toString(36).slice(2, 8);

console.log('[motion.worker] module loaded');

// Signal LOADING immediately so the UI can show a spinner.
postMessage({ type: 'LOADING' } as MotionWorkerMessageOut);

/** Asynchronously load and initialize @techstark/opencv-js WASM module */
async function initOpenCV(): Promise<void> {
  console.log('[motion.worker] OpenCV initialization started');
  try {
    console.log('[motion.worker] Introspecting dynamic import...');
    const cvModule = await import('@techstark/opencv-js');
    console.log(`[OPENCV-INIT][${workerInstanceId}] typeof importedModule:`, typeof cvModule);
    console.log(`[OPENCV-INIT][${workerInstanceId}] keys:`, Object.keys(cvModule));
    console.log(`[OPENCV-INIT][${workerInstanceId}] typeof default:`, typeof (cvModule as any).default);
    console.log(`[OPENCV-INIT][${workerInstanceId}] default is Promise:`, typeof (cvModule as any).default?.then === 'function');
    console.log(`[OPENCV-INIT][${workerInstanceId}] default is callable:`, typeof (cvModule as any).default === 'function');
    console.log(`[OPENCV-INIT][${workerInstanceId}] self.cv exists:`, typeof (self as any).cv !== 'undefined');
    console.log(`[OPENCV-INIT][${workerInstanceId}] globalThis.cv exists:`, typeof (globalThis as any).cv !== 'undefined');

    let instance: any = (cvModule as any).default ?? cvModule;

    // 1. If instance is a Promise / Thenable, await it
    if (instance && typeof instance.then === 'function') {
      console.log(`[OPENCV-INIT][${workerInstanceId}] Awaiting instance Promise...`);
      instance = await instance;
    }

    // 2. If instance is a factory function, call it and await the returned Promise
    if (typeof instance === 'function') {
      console.log(`[OPENCV-INIT][${workerInstanceId}] Calling instance factory function...`);
      instance = await instance();
    }

    // 3. If nested under .default after resolution, unwrap
    if (instance && instance.default) {
      instance = instance.default;
    }

    // 4. Fallback check: if globalThis.cv exists and has getBuildInformation or Mat
    if ((!instance || typeof instance.Mat !== 'function') && (globalThis as any).cv) {
      let globalCv = (globalThis as any).cv;
      if (globalCv && typeof globalCv.then === 'function') {
        globalCv = await globalCv;
      }
      if (globalCv && (typeof globalCv.Mat === 'function' || typeof globalCv.getBuildInformation === 'function')) {
        instance = globalCv;
      }
    }

    if (!instance || (typeof instance.Mat !== 'function' && typeof instance.getBuildInformation !== 'function')) {
      throw new Error(`OpenCV module loaded but valid cv instance not found. Keys: ${Object.keys(instance || {}).join(', ')}`);
    }

    cv = instance;
    workerState = 'ready';
    console.log('[motion.worker] OpenCV initialization completed');
    postMessage({ type: 'READY' } as MotionWorkerMessageOut);
  } catch (err) {
    workerState = 'failed';
    openCVInitError = String(err);
    console.error('[motion.worker] OpenCV initialization failed', err);
    postMessage({ type: 'ERROR', error: `OpenCV init failed: ${String(err)}` } as MotionWorkerMessageOut);
  }
}

// Start OpenCV initialization
initOpenCV();

// ---------------------------------------------------------------------------
// Worker-global state
// ---------------------------------------------------------------------------

/** OffscreenCanvas used to decode ImageBitmap → pixel data for OpenCV. */
let decodeCanvas: OffscreenCanvas | null = null;
let decodeCtx: OffscreenCanvasRenderingContext2D | null = null;

/** Previous-frame grayscale Mat (for optical flow tracking). */
let prevGray: any = null; // cv.Mat
/** Previous feature point positions as a flat Float32Array [x0,y0, x1,y1, ...]. */
let prevPts: any = null; // cv.Mat (TYPE_32FC2)

const respEstimator = new RespiratoryRateEstimator();
const asymmetryTracker = new MotionAsymmetryTracker();

/** Diagnostic counter: total frames with valid (>0) torso point tracking */
let diagValidTrackingFrames = 0;

// How many OpenCV points we track (one per landmark in motionRoi.landmarks)
// plus the four corners of the torso bounding box.
const TORSO_CORNER_COUNT = 4;
const MIN_TORSO_POINTS_FOR_RR = 2;

// ---------------------------------------------------------------------------
// RR runtime state
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pixel helpers
// ---------------------------------------------------------------------------

function ensureDecodeCanvas(width: number, height: number): void {
  if (!decodeCanvas) {
    decodeCanvas = new OffscreenCanvas(width, height);
    decodeCtx = decodeCanvas.getContext('2d', { willReadFrequently: true });
  } else if (decodeCanvas.width !== width || decodeCanvas.height !== height) {
    decodeCanvas.width = width;
    decodeCanvas.height = height;
  }
}

/**
 * Decode an ImageBitmap into a grayscale cv.Mat.
 * The bitmap is closed (freed) after reading.
 */
function bitmapToGrayMat(bitmap: ImageBitmap): any {
  ensureDecodeCanvas(bitmap.width, bitmap.height);
  decodeCtx!.drawImage(bitmap, 0, 0);
  const imageData = decodeCtx!.getImageData(0, 0, bitmap.width, bitmap.height);

  // Build an RGBA cv.Mat from the raw pixel buffer
  const src = cv.matFromImageData(imageData);
  try {
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    return gray;
  } finally {
    src.delete();
  }
}

// ---------------------------------------------------------------------------
// Feature-point helpers
// ---------------------------------------------------------------------------

/**
 * Build a cv.Mat of type CV_32FC2 from an array of [x, y] points.
 * The caller is responsible for calling `.delete()` on the returned Mat.
 */
function pointsToMat(points: [number, number][]): any {
  const mat = new cv.Mat(points.length, 1, cv.CV_32FC2);
  for (let i = 0; i < points.length; i++) {
    mat.data32F[i * 2] = points[i][0];
    mat.data32F[i * 2 + 1] = points[i][1];
  }
  return mat;
}

/**
 * Extract (x, y) pairs from a CV_32FC2 Mat.
 */
function matToPoints(mat: any): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < mat.rows; i++) {
    out.push([mat.data32F[i * 2], mat.data32F[i * 2 + 1]]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Optical flow processing
// ---------------------------------------------------------------------------

interface LKResult {
  trackedPts: [number, number][];
  status: number[]; // 1 for valid tracking, 0 for lost/failed
  error: number[];  // L1 tracking error
  validCount: number;
}

/**
 * Run Lucas-Kanade sparse optical flow between `prevGray` and `currGray`.
 *
 * @param currGray  Current frame grayscale Mat (not deleted here).
 * @param initPts   Initial feature-point positions (CV_32FC2 Mat).
 * @returns LKResult containing tracked points, per-point status, L1 errors, and count of valid points.
 */
function runLK(currGray: any, initPts: any): LKResult {
  const nextPts = new cv.Mat();
  const status = new cv.Mat();
  const err = new cv.Mat();

  try {
    const winSize = new cv.Size(15, 15);
    const maxLevel = 2;
    const criteria = new cv.TermCriteria(
      cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT,
      10,
      0.03,
    );

    cv.calcOpticalFlowPyrLK(prevGray, currGray, initPts, nextPts, status, err, winSize, maxLevel, criteria);

    const trackedPts = matToPoints(nextPts);
    const statusArr: number[] = [];
    const errorArr: number[] = [];
    let validCount = 0;

    const statusData = status.data;
    const errData = err.data32F;
    const MAX_TRACKING_ERROR = 30.0; // Max acceptable L1 pixel tracking error

    for (let i = 0; i < trackedPts.length; i++) {
      const s = statusData[i];
      const e = errData[i];
      if (s === 1 && e <= MAX_TRACKING_ERROR) {
        statusArr.push(1);
        validCount++;
      } else {
        statusArr.push(0);
      }
      errorArr.push(e);
    }

    return { trackedPts, status: statusArr, error: errorArr, validCount };
  } finally {
    nextPts.delete();
    status.delete();
    err.delete();
  }
}

// ---------------------------------------------------------------------------
// Zero-vector helper (used when SQI gate fails)
// ---------------------------------------------------------------------------

/**
 * Safely format a number using toFixed, returning fallback if val is undefined, null, or non-finite.
 */
function safeFixed(val: number | undefined | null, digits: number, fallback = '0.0'): string {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val.toFixed(digits);
  }
  return fallback;
}

const ZERO_ASYMMETRY: [number, number, number, number, number] = [0, 0, 0, 0, 0];

// ---------------------------------------------------------------------------
// Main message handler
// ---------------------------------------------------------------------------

self.onmessage = async (e: MessageEvent<MotionWorkerMessageIn>) => {
  const msg = e.data;
  console.log(`[RR-PROBE][${workerInstanceId}] WORKER MESSAGE RECEIVED: ${msg?.type}`);

  if (msg.type === 'DESTROY') {
    workerState = 'destroyed';
    prevGray?.delete();
    prevPts?.delete();
    prevGray = null;
    prevPts = null;
    respEstimator.reset();
    asymmetryTracker.reset();
    diagValidTrackingFrames = 0;

    postMessage({ type: 'DESTROY_ACK' } as MotionWorkerMessageOut);
    return;
  }

  if (msg.type !== 'PROCESS_FRAME') return;

  const inMsg = msg as Extract<MotionWorkerMessageIn, { type: 'PROCESS_FRAME' }>;
  const { bitmap, motionRoi, sqi, timestamp } = inMsg;
  const workerReceiveTs = performance.now();

  if (workerState !== 'ready') {
    bitmap.close();
    if (workerState === 'failed') {
      console.error(`[motion.worker] OpenCV init failed: ${openCVInitError}`);
    }
    postMessage({
      type: 'METRICS',
      payload: {
        respRate: 0,
        motionAsymmetryFlag: ZERO_ASYMMETRY,
        valid: false,
        timestamp,
      },
    } as MotionWorkerMessageOut);
    return;
  }

  let currGray: any = null;
  let currPts: any = null;
  let ownershipTransferred = false;

    try {
      const procStart = performance.now();
    // ── 1. Decode bitmap → grayscale Mat ─────────────────────────────────────
    currGray = bitmapToGrayMat(bitmap); // bitmap.close() called inside

    const W = currGray.cols;
    const H = currGray.rows;

    // ── 2. Build initial feature points ──────────────────────────────────────
    // Torso ROI corners (used for respiratory vertical displacement)
    const { torso, landmarks } = motionRoi;

    // Extend torso box downward and laterally to track chest/shoulder area
    const faceWidth = torso.xMax - torso.xMin;
    const chestXMin = Math.max(0, torso.xMin - 0.50 * faceWidth);
    const chestXMax = Math.min(1, torso.xMax + 0.50 * faceWidth);
    const chestYMin = Math.min(0.95, torso.yMax + 0.12);
    const chestYMax = Math.min(1.0, torso.yMax + 0.55);

    const torsoCorners: [number, number][] = [
      [chestXMin * W, chestYMin * H],          // upper chest left
      [chestXMax * W, chestYMin * H],          // upper chest right
      [((chestXMin + chestXMax) / 2) * W, chestYMax * H], // lower chest center
      [chestXMax * W, chestYMax * H],          // lower chest right
    ];

    // Facial landmark points (for asymmetry tracking)
    const facialPts: [number, number][] = landmarks.map((lm: { x: number; y: number }) => [lm.x * W, lm.y * H]);

    // All tracking points in one array: torso first, then facial
    const allPts: [number, number][] = [...torsoCorners, ...facialPts];
    currPts = pointsToMat(allPts);

    // ── 3. Optical flow with quality filtering & reinitialization ────────────
    let trackedPts: [number, number][] = allPts;
    let lkStatus: number[] = new Array(allPts.length).fill(1);
    let requiresReinit = false;

    let prevPtsCoords: [number, number][] | null = null;
    if (prevGray !== null && prevPts !== null) {
      prevPtsCoords = matToPoints(prevPts);
      try {
        const lkResult = runLK(currGray, prevPts);
        trackedPts = lkResult.trackedPts;
        lkStatus = lkResult.status;

        // Capture torso point errors for diagnostics (first TORSO_CORNER_COUNT entries)
        var torsoErrors: number[] | undefined = undefined;
        if (lkResult.error && lkResult.error.length >= TORSO_CORNER_COUNT) {
          torsoErrors = lkResult.error.slice(0, TORSO_CORNER_COUNT);
        }

        // Reinitialize tracking if > 35% of feature points failed tracking
        const minValidThreshold = Math.floor(allPts.length * 0.65);
        if (lkResult.validCount < minValidThreshold) {
          requiresReinit = true;
        }
      } catch (err) {
        console.error('[motion.worker] LK flow error:', err);
        requiresReinit = true;
      }
    }

    // ── 4. Compute flow vectors from valid points only ─────────────────────────
    let meanTorsoDy = 0;
    let validTorsoCount = 0;
    let totalTorsoDy = 0;

    for (let i = 0; i < TORSO_CORNER_COUNT; i++) {
      if (lkStatus[i] === 1 && prevPtsCoords) {
        totalTorsoDy += trackedPts[i][1] - prevPtsCoords[i][1];
        validTorsoCount++;
      }
    }

    if (validTorsoCount > 0) {
      meanTorsoDy = totalTorsoDy / validTorsoCount;
      diagValidTrackingFrames++;
    }

    // Facial landmark flow vectors (filtered by tracking status)
    const leftVectors: [number, number][] = [];
    const rightVectors: [number, number][] = [];
    const midX = ((torso.xMin + torso.xMax) / 2) * W;

    for (let i = TORSO_CORNER_COUNT; i < allPts.length; i++) {
      if (lkStatus[i] === 1 && prevPtsCoords) {
        const dx = trackedPts[i][0] - prevPtsCoords[i][0];
        const dy = trackedPts[i][1] - prevPtsCoords[i][1];
        const facialIdx = i - TORSO_CORNER_COUNT;
        const px = facialPts[facialIdx][0];

        if (px < midX) {
          leftVectors.push([dx, dy]);
        } else {
          rightVectors.push([dx, dy]);
        }
      }
    }

    // ── 5. SQI gate — applied BEFORE feeding estimators ──────────────────────
    const SQI_THRESHOLD = 0.3;
    const sqiPass = sqi > SQI_THRESHOLD;
    const hasValidTorsoSample = validTorsoCount >= MIN_TORSO_POINTS_FOR_RR;

    let scaledTorsoDy = 0;
    let scaleFactor = 1;

    if (sqiPass && hasValidTorsoSample) {
      // If the client downsampled the frame, rescale meanTorsoDy back to
      // original video pixel coordinates so thresholds remain comparable.
      const origH = (msg as any).origHeight ?? null;
      scaleFactor = origH && H ? (origH / H) : 1;
      scaledTorsoDy = meanTorsoDy * scaleFactor;
      respEstimator.push(scaledTorsoDy, timestamp);
    }

    if (leftVectors.length > 0 && rightVectors.length > 0) {
      asymmetryTracker.push(leftVectors, rightVectors);
    }

    // ── 6. Update prev-frame state with adaptive reinitialization ────────────
    prevGray?.delete();
    prevPts?.delete();
    prevGray = currGray;

    if (requiresReinit) {
      console.warn('[motion.worker] Tracking quality degraded (>35% points lost); reinitializing feature points.');
      prevPts = pointsToMat(allPts);
      currPts.delete();
    } else {
      prevPts = currPts;
    }

    ownershipTransferred = true;

    // ── 7. Diagnostic logging (isolated in try-catch) ────────────────────────
    const respRateSmoothed = respEstimator.getRespRate();
    const respRateRaw      = respEstimator.getRespRateRaw();
    const spectralStats    = respEstimator.computeSpectralStats();
    const bufferFull       = respEstimator.isBufferFull;
    const finalValid       = bufferFull && spectralStats.isValid;

    let currentDiagSnapshot: RrDiagSnapshot | undefined = undefined;
    try {
      const tsStats = respEstimator.timestampStats;
      const sigStats = respEstimator.signalStats;

      currentDiagSnapshot = {
        effectiveFps: safeFixed(respEstimator.effectiveFpsValue, 1),
        torsoPointsTracked: validTorsoCount,
        rawBufferLength: respEstimator.rawBufferLength,
        filteredBufferLength: respEstimator.filteredBufferLength,
        bufferSeconds: safeFixed(sigStats.bufferSeconds ?? spectralStats.bufferSeconds, 1),
        isBufferFull: bufferFull,
        sampleCount: spectralStats.sampleCount ?? respEstimator.sampleCount,
        fftResolutionHz: safeFixed(spectralStats.fftResolutionHz ?? respEstimator.fftResolutionHz, 5),
        timestampDtMin: safeFixed(tsStats.minDt, 4),
        timestampDtMax: safeFixed(tsStats.maxDt, 4),
        timestampDtMean: safeFixed(tsStats.meanDt, 4),
        timestampDtStd: safeFixed(tsStats.stdDt, 4),
        bandPower: safeFixed(spectralStats.bandPower, 6),
        respRms: safeFixed(spectralStats.rms, 4),
        respPeakToPeak: safeFixed(spectralStats.p2p, 4),
        peakFrequency: safeFixed(spectralStats.peakFrequency, 3),
        instantRR: Math.round((spectralStats.peakFrequency || 0) * 60),
        rawRR: respRateRaw,
        smoothedRR: respRateSmoothed,
        peakPowerRatio: safeFixed(spectralStats.peakPowerRatio, 3),
        signalQuality: spectralStats.signalQuality || 'LOW',
        finalValid,
        diagnosticClassification: spectralStats.diagnosticClassification ?? (finalValid ? 'ACCEPT' : 'REJECT'),
        rejectionReason: spectralStats.rejectionReason ?? (finalValid ? 'ACCEPT' : 'REJECT'),
        lastProbeMessage: `[RR-STATE][t=${safeFixed(timestamp / 1000, 1)}s] ${finalValid ? 'ACCEPT' : 'REJECT'} | class=${spectralStats.diagnosticClassification ?? 'N/A'} | peakFreq=${safeFixed(spectralStats.peakFrequency, 3)}Hz`,
      };
    } catch (diagErr) {
      console.warn('[motion.worker] Diagnostic snapshot building error:', diagErr);
    }

    // ── 8. Post METRICS — gate display validity on SQI ────────────────────────
    if (!sqiPass) {
      postMessage({
        type: 'METRICS',
        payload: {
          respRate: 0,
          motionAsymmetryFlag: ZERO_ASYMMETRY,
          valid: false,
          timestamp,
          diagSnapshot: currentDiagSnapshot,
        },
      } as MotionWorkerMessageOut);
      return;
    }

    // ── 9. Compute outputs ────────────────────────────────────────────────────
    const motionAsymmetryFlag = asymmetryTracker.compute();
    const payload: MotionMetrics = {
      respRate: respRateSmoothed,
      motionAsymmetryFlag,
      valid: finalValid,
      timestamp,
      diagSnapshot: currentDiagSnapshot,
    };

    postMessage({ type: 'METRICS', payload } as MotionWorkerMessageOut);
  } catch (err) {
    console.error('[motion.worker] Frame processing error:', err);
    postMessage({ type: 'ERROR', error: `Frame processing failed: ${String(err)}` } as MotionWorkerMessageOut);
  } finally {
    bitmap.close();
    if (!ownershipTransferred) {
      currGray?.delete();
      currPts?.delete();
    }
  }
};

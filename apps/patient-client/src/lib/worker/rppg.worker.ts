import type { RppgWorkerMessageIn, RppgWorkerMessageOut, RgbSample } from '../types/rppg';
import type { MotionRoi } from '../types/roi';
import { ChromProcessor } from '../rppg/chrom';
import { SQIEngine } from '../rppg/sqi';
import { FFTProcessor } from '../rppg/fft';

const sqiEngine = new SQIEngine();
const BUFFER_SEC = 10;
const MAX_TIMESTAMPS = 30; // 30-frame rolling average for FPS calculation

/**
 * Minimum luminance distance (0–255 scale) between the average pixel intensity
 * of the chosen background ROI and the skin ROI.  If the two regions are too
 * similar (e.g. both are skin-coloured), the background-referencing step in
 * CHROM will divide out the pulse component and flatten the signal — causing
 * the FFT to find no spectral peak and return a fake default BPM.
 */
const MIN_BG_LUMINANCE_DIFF = 15;

const skinBuffer: RgbSample[] = [];
const bgBuffer: RgbSample[] = [];
let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let lastLogTime = 0;
let rppgFrameCount = 0;
const frameTimestamps: number[] = [];
let measuredFps = 30; // safe default until rolling average computes
let currentMaxSamples = measuredFps * BUFFER_SEC;

// Initialize offscreen canvas for CPU fallback
function initCanvas(width: number, height: number) {
  if (!canvas) {
    canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  } else if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

/**
 * Extract the average RGB value from a rectangular sub-region of the already-
 * drawn canvas.  The caller MUST call ctx.drawImage() once before invoking
 * this function for the first time in a given frame — all calls within the
 * same frame share the same canvas snapshot.
 *
 * @param roi  Normalised bounding box (0–1 coordinates).
 */
function extractAverageRGB(
  roi: { xMin: number; yMin: number; xMax: number; yMax: number },
): { r: number; g: number; b: number } {
  if (!ctx || !canvas) return { r: 0, g: 0, b: 0 };

  // Use canvas dimensions — the canvas was sized to the bitmap by initCanvas,
  // so canvas.width/height === bitmap.width/height for this frame.
  const cw = canvas.width;
  const ch = canvas.height;

  const x = Math.floor(roi.xMin * cw);
  const y = Math.floor(roi.yMin * ch);
  const w = Math.floor((roi.xMax - roi.xMin) * cw);
  const h = Math.floor((roi.yMax - roi.yMin) * ch);

  // Prevent out of bounds
  if (w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > cw || y + h > ch) {
    return { r: 0, g: 0, b: 0 };
  }

  const imageData = ctx.getImageData(x, y, w, h);
  const data = imageData.data;

  let r = 0,
    g = 0,
    b = 0;
  const pixels = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }

  return {
    r: r / pixels,
    g: g / pixels,
    b: b / pixels,
  };
}

/**
 * Choose a 10%-wide background ROI from one of the four frame corners,
 * preferring the corner whose centre is furthest from the skin ROI centre.
 * As a secondary check, sample each candidate corner's average luminance and
 * skip any corner that is too similar to the skin average (MIN_BG_LUMINANCE_DIFF).
 *
 * Requires the caller to have drawn the current bitmap to the shared canvas
 * before this function is invoked (extractAverageRGB no longer redraws).
 *
 * @param skinRoi          Normalised bounding box of the skin region (0–1 coords).
 * @param skinAvgLuminance Pre-computed skin luminance (avoids double extraction).
 * @returns A normalised ROI for the chosen background corner.
 */
function chooseBgRoi(
  skinRoi: { xMin: number; yMin: number; xMax: number; yMax: number },
  skinAvgLuminance: number,
): { xMin: number; yMin: number; xMax: number; yMax: number } {
  const STRIP = 0.10; // 10% corner strip width/height

  // Four candidate corners (normalised coords, 10% squares)
  const candidates = [
    { xMin: 0.0,        yMin: 0.0,        xMax: STRIP,      yMax: STRIP      }, // top-left
    { xMin: 1 - STRIP,  yMin: 0.0,        xMax: 1.0,        yMax: STRIP      }, // top-right
    { xMin: 0.0,        yMin: 1 - STRIP,  xMax: STRIP,      yMax: 1.0        }, // bottom-left
    { xMin: 1 - STRIP,  yMin: 1 - STRIP,  xMax: 1.0,        yMax: 1.0        }, // bottom-right
  ];

  // Centre of the skin ROI
  const skinCx = (skinRoi.xMin + skinRoi.xMax) / 2;
  const skinCy = (skinRoi.yMin + skinRoi.yMax) / 2;

  let bestRoi = candidates[0];
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const cx = (candidate.xMin + candidate.xMax) / 2;
    const cy = (candidate.yMin + candidate.yMax) / 2;

    // Primary criterion: Euclidean distance from the skin centre (normalised coords)
    const dist = Math.sqrt((cx - skinCx) ** 2 + (cy - skinCy) ** 2);

    // Secondary criterion: luminance difference — penalise corners too similar to skin
    // extractAverageRGB reads from the already-drawn canvas (no redraw needed here)
    const bgRgb = extractAverageRGB(candidate);
    const bgLuminance = 0.299 * bgRgb.r + 0.587 * bgRgb.g + 0.114 * bgRgb.b;
    const lumDiff = Math.abs(bgLuminance - skinAvgLuminance);

    // Skip corners that are too skin-like
    if (lumDiff < MIN_BG_LUMINANCE_DIFF) continue;

    // Score = distance (higher = better), tiebreak by luminance difference
    const score = dist + lumDiff * 0.01;

    if (score > bestScore) {
      bestScore = score;
      bestRoi = candidate;
    }
  }

  return bestRoi;
}

let workerProcessFramesReceived = 0;
let workerProcessFramesCompleted = 0;
const workerProcessTimestamps: number[] = [];
const workerProcessTimes: number[] = [];

self.onmessage = async (e: MessageEvent<RppgWorkerMessageIn>) => {
  const msg = e.data;

  if (msg.type === 'PROCESS_FRAME') {
    workerProcessFramesReceived += 1;
    const tStart = performance.now();
    try {
      rppgFrameCount += 1;
      initCanvas(msg.bitmap.width, msg.bitmap.height);

      // Draw the full frame ONCE onto the shared canvas.
      // All extractAverageRGB calls below read from this single snapshot,
      // eliminating the previous 6× redundant GPU→CPU blit per frame.
      ctx!.drawImage(msg.bitmap, 0, 0);

      // 1. Bilateral cheek RGB extraction — left and right cheeks sampled independently
      const leftRgb  = extractAverageRGB(msg.leftCheekRoi);
      const rightRgb = extractAverageRGB(msg.rightCheekRoi);

      // Area-weighted combination: ensures wider cheek contributes proportionally.
      // For a frontal face both cheeks are approximately equal area, so this
      // is equivalent to a simple arithmetic mean but degrades gracefully on
      // profile angles or asymmetric crops.
      const leftArea  = (msg.leftCheekRoi.xMax  - msg.leftCheekRoi.xMin)  * (msg.leftCheekRoi.yMax  - msg.leftCheekRoi.yMin);
      const rightArea = (msg.rightCheekRoi.xMax - msg.rightCheekRoi.xMin) * (msg.rightCheekRoi.yMax - msg.rightCheekRoi.yMin);
      const totalArea = leftArea + rightArea || 1; // guard against degenerate boxes

      const skinRgb = {
        r: (leftRgb.r * leftArea + rightRgb.r * rightArea) / totalArea,
        g: (leftRgb.g * leftArea + rightRgb.g * rightArea) / totalArea,
        b: (leftRgb.b * leftArea + rightRgb.b * rightArea) / totalArea,
      };

      // Pre-compute skin luminance for the background ROI selector
      const skinLuminance = 0.299 * skinRgb.r + 0.587 * skinRgb.g + 0.114 * skinRgb.b;

      // Bounding envelope of both cheeks — used as the spatial reference for
      // background corner selection so corners far from BOTH cheeks are preferred.
      const combinedCheekRoi = {
        xMin: Math.min(msg.leftCheekRoi.xMin, msg.rightCheekRoi.xMin),
        yMin: Math.min(msg.leftCheekRoi.yMin, msg.rightCheekRoi.yMin),
        xMax: Math.max(msg.leftCheekRoi.xMax, msg.rightCheekRoi.xMax),
        yMax: Math.max(msg.leftCheekRoi.yMax, msg.rightCheekRoi.yMax),
      };

      // Choose a background corner that is spatially far from the face and
      // has sufficiently different luminance to skin — avoids flattening the
      // CHROM pulse signal via a bad background-reference region.
      const bgRoi = chooseBgRoi(combinedCheekRoi, skinLuminance);
      const bgRgb = extractAverageRGB(bgRoi);

      skinBuffer.push({ ...skinRgb, timestamp: msg.timestamp });
      bgBuffer.push({ ...bgRgb, timestamp: msg.timestamp });

      // Update rolling FPS
      frameTimestamps.push(msg.timestamp);
      if (frameTimestamps.length > MAX_TIMESTAMPS) {
        frameTimestamps.shift();
      }

      const timestampDts = frameTimestamps.length >= 2
        ? frameTimestamps.slice(1).map((t, idx) => (t - frameTimestamps[idx]) / 1000)
        : [];
      const timestampDtStats = timestampDts.length > 0
        ? {
            min: Math.min(...timestampDts),
            max: Math.max(...timestampDts),
            mean: timestampDts.reduce((sum, dt) => sum + dt, 0) / timestampDts.length,
            std: Math.sqrt(
              timestampDts.reduce((sum, dt) => sum + (dt - (timestampDts.reduce((s, x) => s + x, 0) / timestampDts.length)) ** 2, 0) / timestampDts.length,
            ),
          }
        : { min: 0, max: 0, mean: 0, std: 0 };

      if (frameTimestamps.length >= 2) {
        const elapsedMs = frameTimestamps[frameTimestamps.length - 1] - frameTimestamps[0];
        if (elapsedMs > 0) {
          const avgIntervalMs = elapsedMs / (frameTimestamps.length - 1);
          measuredFps = 1000 / avgIntervalMs;
          // Floor the required samples so a sudden huge pause doesn't empty the buffer,
          // but otherwise scale exactly to measured real-time FPS.
          currentMaxSamples = Math.max(30, Math.round(measuredFps * BUFFER_SEC));
        }
      }

      // Keep buffer size fixed to the dynamically required size
      if (skinBuffer.length > currentMaxSamples) {
        // shift by however many are over the limit in case currentMaxSamples dropped suddenly
        const excess = skinBuffer.length - currentMaxSamples;
        skinBuffer.splice(0, excess);
        bgBuffer.splice(0, excess);
      }

      const now = performance.now();
      if (now - lastLogTime > 1000) {
        const bufferDurationMs = skinBuffer.length >= 2
          ? skinBuffer[skinBuffer.length - 1].timestamp - skinBuffer[0].timestamp
          : 0;

        console.log(`[rPPG-WORKER] frame=${rppgFrameCount} buffer=${skinBuffer.length}/${currentMaxSamples} ` +
          `dur=${(bufferDurationMs / 1000).toFixed(1)}s fps=${measuredFps.toFixed(1)} ` +
          `dt=[${timestampDtStats.min.toFixed(3)},${timestampDtStats.max.toFixed(3)}] ` +
          `mean=${timestampDtStats.mean.toFixed(3)} std=${timestampDtStats.std.toFixed(3)}`,
        );
        lastLogTime = now;
      }

      // 2. Evaluate SQI
      const sqi = sqiEngine.evaluate(msg.motionRoi as MotionRoi);

      let bpm = 0;
      let hrv = 0;
      let hrvValid = false;
      let valid = false;
      let pulseStd = 0;
      let pulseP2P = 0;
      let rppgBufferDurationMs = skinBuffer.length >= 2
        ? skinBuffer[skinBuffer.length - 1].timestamp - skinBuffer[0].timestamp
        : 0;
      let timestampDtMin = timestampDtStats.min;
      let timestampDtMax = timestampDtStats.max;
      let timestampDtMean = timestampDtStats.mean;
      let timestampDtStd = timestampDtStats.std;

      let fftResult: ReturnType<typeof FFTProcessor.analyze> | undefined;
      // Hoisted so postMessage can reference the computed signal without a second processWindow call.
      let lastPulseSignal: number[] | undefined;

      // 3. Run CHROM & FFT if buffer is full and SQI is acceptable
      if (skinBuffer.length >= currentMaxSamples) {
        if (sqi > 0.3) {
          const pulseSignal = ChromProcessor.processWindow(skinBuffer, bgBuffer);
          const timestamps = skinBuffer.map((s) => s.timestamp);

          if (pulseSignal.length > 0) {
            const min = Math.min(...pulseSignal);
            const max = Math.max(...pulseSignal);
            const mean = pulseSignal.reduce((sum, v) => sum + v, 0) / pulseSignal.length;
            pulseStd = Math.sqrt(pulseSignal.reduce((sum, v) => sum + (v - mean) ** 2, 0) / pulseSignal.length);
            pulseP2P = max - min;
            lastPulseSignal = pulseSignal;
          }

          fftResult = FFTProcessor.analyze(pulseSignal, measuredFps, timestamps, sqi);

          if (fftResult && fftResult.valid) {
            // FFT found a real spectral peak in the physiological HR band
            valid = true;
            bpm = fftResult.bpm;
            hrv = fftResult.hrv;

            const res = fftResult.hrvResult;
            hrvValid = res?.hrvValid ?? false;

            // Diagnostic logging (throttled to ~1 Hz)
            if (res && now - lastLogTime >= 1000) {
              lastLogTime = now;
              if (res.hrvValid) {
                console.log(
                  `[HRV-DIAG] ACCEPT: RMSSD=${res.rmssd} ms, SDNN=${res.sdnn} ms, ` +
                  `validIBIs=${res.validIBIs}, beats=${res.detectedBeats}, HR_ibi=${res.heartRateFromIbi} BPM`,
                );
              } else {
                console.log(
                  `[HRV-DIAG] REJECT: ${res.rejectionReason} (beats=${res.detectedBeats}, validIBIs=${res.validIBIs}, sqi=${sqi.toFixed(2)})`,
                );
              }

              console.log('[HRV-DIAG]', {
                signalQuality: sqi.toFixed(2),
                heartRate: bpm.toFixed(1),
                heartRateFromIbi: res.heartRateFromIbi,
                detectedBeats: res.detectedBeats,
                validIBIs: res.validIBIs,
                rejectedIBIs: res.rejectedIBIs,
                meanIBI: res.meanIBI,
                minIBI: res.minIBI,
                maxIBI: res.maxIBI,
                rmssd: res.rmssd,
                sdnn: res.sdnn,
                hrvValid: res.hrvValid,
                rejectionReason: res.rejectionReason,
              });
            }

            if (!hrvValid) {
              hrv = 0;
            }
          } else {
            // Power spectrum was flat — signal may still be contaminated.
            // valid stays false; SQI was already recorded in the lifecycle hook.
            valid = false;
          }
        } else {
          // If SQI drops too low, we mark window invalid but don't flush buffer
          // completely — just wait for movement to settle.
          valid = false;
        }
      }

      workerProcessFramesCompleted += 1;
      const tEnd = performance.now();
      workerProcessTimes.push(tEnd - tStart);
      if (workerProcessTimes.length > 30) workerProcessTimes.shift();
      const avgProc = workerProcessTimes.reduce((a, b) => a + b, 0) / workerProcessTimes.length;
      const maxProc = Math.max(...workerProcessTimes);
      
      workerProcessTimestamps.push(tEnd);
      if (workerProcessTimestamps.length > 30) workerProcessTimestamps.shift();
      let workerFps = 0;
      if (workerProcessTimestamps.length >= 2) {
         workerFps = 1000 / ((workerProcessTimestamps[workerProcessTimestamps.length - 1] - workerProcessTimestamps[0]) / (workerProcessTimestamps.length - 1));
      }

      // ── DIAGNOSTIC: log hrv value right before postMessage ────────────────
      console.log('[HRV-PRE-POST] hrv=', hrv, '| hrvValid=', hrvValid, '| valid=', valid,
        '| fftResult.hrv=', fftResult?.hrv ?? 'n/a',
        '| rmssd=', fftResult?.hrvResult?.rmssd ?? 'n/a',
        '| rejectionReason=', fftResult?.hrvResult?.rejectionReason ?? 'n/a');

      postMessage({
        type: 'METRICS',
        payload: {
          bpm,
          hrv,
          hrvValid,
          rejectionReason: fftResult?.hrvResult?.rejectionReason,
          detectedBeats: fftResult?.hrvResult?.detectedBeats,
          validIBIs: fftResult?.hrvResult?.validIBIs,
          rejectedIBIs: fftResult?.hrvResult?.rejectedIBIs,
          meanIBI: fftResult?.hrvResult?.meanIBI,
          minIBI: fftResult?.hrvResult?.minIBI,
          maxIBI: fftResult?.hrvResult?.maxIBI,
          rmssd: fftResult?.hrvResult?.rmssd,
          sdnn: fftResult?.hrvResult?.sdnn,
          heartRateFromIbi: fftResult?.hrvResult?.heartRateFromIbi,
          hrvDiag: fftResult?.hrvResult?.diag,
          sqi,
          valid,
          timestamp: msg.timestamp,
          rppgFrameCount,
          rppgBufferLength: skinBuffer.length,
          rppgBufferDurationMs,
          rppgMeasuredFps: measuredFps,
          rppgTimestampDtMin: timestampDtMin,
          rppgTimestampDtMax: timestampDtMax,
          rppgTimestampDtMean: timestampDtMean,
          rppgTimestampDtStd: timestampDtStd,
          pulseStd,
          pulseP2P,
          // Raw CHROM output for waveform rendering — only emitted on valid frames.
          pulseSignal: valid ? lastPulseSignal : undefined,
          workerProcessFramesReceived,
          workerProcessFramesCompleted,
          workerProcessAvgTime: avgProc,
          workerProcessMaxTime: maxProc,
          workerProcessFps: workerFps,
        },
      } as RppgWorkerMessageOut);
    } catch (error) {
      console.error('rPPG Worker Error:', error);
      postMessage({ type: 'ERROR', error: String(error) } as RppgWorkerMessageOut);
    } finally {
      msg.bitmap.close();
    }
  }
};

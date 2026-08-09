import { useEffect, useRef, useState, useCallback } from 'react';
import type { RppgWorkerMessageIn, RppgWorkerMessageOut, RppgMetrics } from '../lib/types/rppg';
import type { RoiData } from '../lib/types/roi';

export function useRppgWorker(
  videoElement: HTMLVideoElement | null,
  latestRoiData: RoiData | null,
) {
  const [metrics, setMetrics] = useState<RppgMetrics | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef<number>(0);
  const isProcessingRef = useRef(false);
  const latestRoiRef = useRef<RoiData | null>(null);

  // --- Instrumentation State ---
  const cameraFrames = useRef(0);
  const cameraTimestamps = useRef<number[]>([]);
  const dispatchSent = useRef(0);
  const dispatchSkipped = useRef(0);
  const dispatchTimestamps = useRef<number[]>([]);
  const bitmapTimes = useRef<number[]>([]);
  const bitmapFailures = useRef(0);
  const instMetrics = useRef<Partial<RppgMetrics>>({});
  const cameraRafRef = useRef<number>(0);

  // Keep ref updated to avoid stale closures in requestAnimationFrame
  useEffect(() => {
    latestRoiRef.current = latestRoiData;
  }, [latestRoiData]);

  useEffect(() => {
    workerRef.current = new Worker(new URL('../lib/worker/rppg.worker.ts', import.meta.url), {
      type: 'module'
    });

    workerRef.current.onmessage = (e: MessageEvent<RppgWorkerMessageOut>) => {
      const msg = e.data;
      if (msg.type === 'METRICS' && msg.payload) {
        setMetrics({
          ...msg.payload,
          ...instMetrics.current
        });
        isProcessingRef.current = false;
      } else if (msg.type === 'ERROR') {
        console.error('rPPG Worker Error:', msg.error);
        isProcessingRef.current = false;
      }
    };

    return () => {
      workerRef.current?.terminate();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (cameraRafRef.current) cancelAnimationFrame(cameraRafRef.current);
    };
  }, []);

  // --- Camera Frame Counter (Passive) ---
  const countCameraFrames = useCallback((now: number) => {
    if (!videoElement) return;
    cameraFrames.current += 1;
    cameraTimestamps.current.push(now);
    if (cameraTimestamps.current.length > 30) {
      cameraTimestamps.current.shift();
    }
    
    // Update camera metrics
    const ts = cameraTimestamps.current;
    if (ts.length >= 2) {
      const elapsed = ts[ts.length - 1] - ts[0];
      const fps = 1000 / (elapsed / (ts.length - 1));
      const dts = ts.slice(1).map((t, i) => (t - ts[i]) / 1000);
      const mean = dts.reduce((a, b) => a + b, 0) / dts.length;
      const std = Math.sqrt(dts.reduce((a, b) => a + (b - mean) ** 2, 0) / dts.length);
      instMetrics.current.cameraFps = fps;
      instMetrics.current.cameraFrameCount = cameraFrames.current;
      instMetrics.current.cameraTimestampDtMean = mean;
      instMetrics.current.cameraTimestampDtStd = std;
    }
    
    // Check if rvfc is supported, else fallback to rAF.
    if ('requestVideoFrameCallback' in videoElement) {
      // @ts-ignore
      cameraRafRef.current = videoElement.requestVideoFrameCallback(countCameraFrames);
    } else {
      cameraRafRef.current = requestAnimationFrame(countCameraFrames);
    }
  }, [videoElement]);

  useEffect(() => {
    if (videoElement) {
      if ('requestVideoFrameCallback' in videoElement) {
        // @ts-ignore
        cameraRafRef.current = videoElement.requestVideoFrameCallback(countCameraFrames);
      } else {
        cameraRafRef.current = requestAnimationFrame(countCameraFrames);
      }
    }
    return () => {
      if (cameraRafRef.current) {
        if (videoElement && 'cancelVideoFrameCallback' in videoElement) {
          // @ts-ignore
          videoElement.cancelVideoFrameCallback(cameraRafRef.current);
        } else {
          cancelAnimationFrame(cameraRafRef.current);
        }
      }
    };
  }, [videoElement, countCameraFrames]);

  const processFrame = useCallback(async () => {
    if (!videoElement || !workerRef.current) return;

    // Only process if we have valid skin ROI from Face Mesh and worker isn't busy
    const roi = latestRoiRef.current;

    if (
      videoElement.readyState >= 2 &&
      roi?.faceDetected &&
      roi.skinRoi &&
      roi.motionRoi
    ) {
      if (isProcessingRef.current) {
        dispatchSkipped.current += 1;
      } else {
        let bitmap: ImageBitmap | null = null;
        try {
          isProcessingRef.current = true;
          
          const t0 = performance.now();
          bitmap = await createImageBitmap(videoElement);
          const t1 = performance.now();
          
          // Track bitmap times
          bitmapTimes.current.push(t1 - t0);
          if (bitmapTimes.current.length > 30) bitmapTimes.current.shift();
          const bAvg = bitmapTimes.current.reduce((a, b) => a + b, 0) / bitmapTimes.current.length;
          const bMax = Math.max(...bitmapTimes.current);
          instMetrics.current.bitmapAvgTime = bAvg;
          instMetrics.current.bitmapMaxTime = bMax;
          
          // Track dispatch metrics
          dispatchSent.current += 1;
          dispatchTimestamps.current.push(t1);
          if (dispatchTimestamps.current.length > 30) dispatchTimestamps.current.shift();
          
          const ts = dispatchTimestamps.current;
          if (ts.length >= 2) {
             const elapsed = ts[ts.length - 1] - ts[0];
             instMetrics.current.dispatchFps = 1000 / (elapsed / (ts.length - 1));
             const dts = ts.slice(1).map((t, i) => t - ts[i]);
             instMetrics.current.dispatchAvgInterval = dts.reduce((a, b) => a + b, 0) / dts.length;
             instMetrics.current.dispatchMaxGap = Math.max(...dts);
          }
          instMetrics.current.dispatchFramesSent = dispatchSent.current;
          instMetrics.current.dispatchFramesSkipped = dispatchSkipped.current;
          instMetrics.current.bitmapFailures = bitmapFailures.current;

          workerRef.current.postMessage(
            {
              type: 'PROCESS_FRAME',
              bitmap,
              // Bilateral cheek ROIs — both cheeks are already computed by useFaceMesh
              leftCheekRoi:  roi.skinRoi.leftCheek,
              rightCheekRoi: roi.skinRoi.rightCheek,
              motionRoi: roi.motionRoi,
              timestamp: performance.now(),
            } as RppgWorkerMessageIn,
            [bitmap],
          );
        } catch (err) {
          console.error('Error in rPPG frame loop:', err);
          bitmapFailures.current += 1;
          bitmap?.close();
          isProcessingRef.current = false;
        }
      }
    }

    requestRef.current = requestAnimationFrame(processFrame);
  }, [videoElement]);

  useEffect(() => {
    if (videoElement) {
      requestRef.current = requestAnimationFrame(processFrame);
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [videoElement, processFrame]);

  return { metrics };
}

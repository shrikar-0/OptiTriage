import { useEffect, useRef, useState, useCallback } from 'react';
import type { MotionWorkerMessageIn, MotionWorkerMessageOut, MotionMetrics } from '../lib/types/motion';
import type { RoiData } from '../lib/types/roi';

/**
 * useMotionWorker — manages the motion-lane Web Worker lifecycle.
 *
 * Mirrors the shape of useRppgWorker so ScanPage can consume both hooks
 * symmetrically.  The worker runs independently of the rPPG worker; both
 * receive their own ImageBitmap transfer from the same video element.
 *
 * @param videoElement  Live <video> DOM node (null while camera initialises).
 * @param latestRoiData Latest ROI data from useFaceMesh (provides motionRoi).
 * @param latestSqi     Most recent SQI value from the rPPG worker (or 1.0 if
 *                      not yet available — conservative open gate).
 */
let workerCreationCount = 0;

export function useMotionWorker(
  videoRefOrElement: React.RefObject<HTMLVideoElement | null> | HTMLVideoElement | null,
  latestRoiData: RoiData | null,
  latestSqi: number,
) {
  const [motionMetrics, setMotionMetrics] = useState<MotionMetrics | null>(null);
  const [isMotionReady, setIsMotionReady] = useState(false);
  const [isMotionLoading, setIsMotionLoading] = useState(false);
  const [lastProbeMessage, setLastProbeMessage] = useState<string>('worker hook initialized');

  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef<number>(0);
  const isProcessingRef = useRef(false);

  // Keep ref updated to avoid stale closures inside rAF
  const latestRoiRef = useRef<RoiData | null>(null);
  const latestSqiRef = useRef<number>(latestSqi);
  const downsampleCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    latestRoiRef.current = latestRoiData;
  }, [latestRoiData]);

  useEffect(() => {
    latestSqiRef.current = latestSqi;
  }, [latestSqi]);

  // ── Worker lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    workerCreationCount += 1;

    const worker = new Worker(
      new URL('../lib/worker/motion.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<MotionWorkerMessageOut>) => {
      const msg = e.data;

      switch (msg.type) {
        case 'LOADING':
          setIsMotionLoading(true);
          setIsMotionReady(false);
          setLastProbeMessage('Worker LOADING');
          break;

        case 'READY':
          setIsMotionLoading(false);
          setIsMotionReady(true);
          setLastProbeMessage('Worker READY');
          break;

        case 'METRICS':
          setMotionMetrics(msg.payload);
          isProcessingRef.current = false;
          break;

        case 'ERROR':
          console.error('[RR-PROBE] worker returned ERROR:', msg.error);
          setLastProbeMessage(msg.error);
          isProcessingRef.current = false;
          break;

        case 'DESTROY_ACK':
          setLastProbeMessage('Worker DESTROY_ACK');
          break;
      }
    };

    worker.onerror = (event: ErrorEvent) => {
      console.error('[RR-PROBE] worker.onerror event:', event);
      setLastProbeMessage(`Uncaught error: ${event.message}`);
      isProcessingRef.current = false;
    };

    return () => {
      console.log('[RR-PROBE][hook] Destroying motion worker instance');
      const w = workerRef.current;
      if (w) {
        const fallbackTimer = setTimeout(() => {
          console.log('[RR-PROBE] DESTROY_ACK timeout fallback firing terminate()');
          w.terminate();
        }, 500);

        w.onmessage = (e: MessageEvent<MotionWorkerMessageOut>) => {
          if (e.data.type === 'DESTROY_ACK') {
            console.log('[RR-PROBE] worker DESTROY_ACK received, terminating worker thread');
            clearTimeout(fallbackTimer);
            w.terminate();
          }
        };

        w.postMessage({ type: 'DESTROY' } as MotionWorkerMessageIn);
      }
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // ── rAF frame-dispatch loop ──────────────────────────────────────────────
  const processFrame = useCallback(async () => {
    const videoElement =
      videoRefOrElement && 'current' in videoRefOrElement
        ? videoRefOrElement.current
        : videoRefOrElement;
    const roi = latestRoiRef.current;
    const sqi = latestSqiRef.current;

    if (
      !isProcessingRef.current &&
      videoElement &&
      workerRef.current &&
      videoElement.readyState >= 2 &&
      roi?.faceDetected &&
      roi.motionRoi
    ) {
      let bitmap: ImageBitmap | null = null;
      try {
        isProcessingRef.current = true;
        // Downsample the video frame to reduce worker decode/processing cost on mobile.
        const origW = videoElement.videoWidth || videoElement.width || 640;
        const origH = videoElement.videoHeight || videoElement.height || 480;
        const targetW = Math.min(360, origW);
        const targetH = Math.round((origH * targetW) / origW);

        let canvas = downsampleCanvasRef.current;
        if (!canvas) {
          canvas = document.createElement('canvas');
          downsampleCanvasRef.current = canvas;
        }
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(videoElement, 0, 0, targetW, targetH);
        bitmap = await createImageBitmap(canvas);


        const clientTs = performance.now();

        workerRef.current.postMessage(
          {
            type: 'PROCESS_FRAME',
            bitmap,
            motionRoi: roi.motionRoi,
            sqi,
            timestamp: clientTs,
          } as MotionWorkerMessageIn,
          [bitmap], // transfer ownership — zero-copy, no clone
        );
      } catch (err) {
        console.error('[useMotionWorker] Frame capture error:', err);
        bitmap?.close();
        isProcessingRef.current = false;
      }
    }

    requestRef.current = requestAnimationFrame(processFrame);
  }, [videoRefOrElement]);

  // Start the rAF loop once worker is created
  useEffect(() => {
    requestRef.current = requestAnimationFrame(processFrame);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [processFrame]);

  return {
    motionMetrics,
    isMotionReady,
    isMotionLoading,
    diagSnapshot: motionMetrics?.diagSnapshot,
    lastProbeMessage,
  };
}

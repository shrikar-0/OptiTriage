import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { RoiData, BoundingBox } from '../lib/types/roi';

// ---------------------------------------------------------------------------
// Module-level singleton — survives React Strict Mode's double-mount cycle.
// FaceLandmarker's WASM graph is non-idempotent: destroying it on the first
// cleanup (caused by Strict Mode) leaves the second mount with a dead context.
// Keeping a single instance avoids this entirely.
// ---------------------------------------------------------------------------
let _instance: FaceLandmarker | null = null;
let _initPromise: Promise<FaceLandmarker> | null = null;

async function getOrCreateLandmarker(): Promise<FaceLandmarker> {
  if (_instance) {
    console.log('[useFaceMesh] Reusing existing FaceLandmarker singleton.');
    return _instance;
  }

  if (_initPromise) {
    console.log('[useFaceMesh] Init already in progress, awaiting shared promise...');
    return _initPromise;
  }

  _initPromise = (async () => {
    console.log('[useFaceMesh] Creating FaceLandmarker (first time)...');
    const filesetResolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm',
    );
    console.log('[useFaceMesh] Fileset resolved. Loading model...');

    const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU',
      },
      outputFaceBlendshapes: false,
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    _instance = landmarker;
    console.log('[useFaceMesh] FaceLandmarker singleton created successfully.');
    return landmarker;
  })();

  return _initPromise;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeBoundingBox(landmarks: NormalizedLandmark[], indices: number[]): BoundingBox {
  let xMin = Infinity,
    yMin = Infinity,
    xMax = -Infinity,
    yMax = -Infinity;
  for (const idx of indices) {
    if (!landmarks[idx]) continue;
    const { x, y } = landmarks[idx];
    if (x < xMin) xMin = x;
    if (y < yMin) yMin = y;
    if (x > xMax) xMax = x;
    if (y > yMax) yMax = y;
  }
  const margin = 0.02;
  return {
    xMin: Math.max(0, xMin - margin),
    yMin: Math.max(0, yMin - margin),
    xMax: Math.min(1, xMax + margin),
    yMax: Math.min(1, yMax + margin),
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFaceMesh(videoRef: RefObject<HTMLVideoElement | null>) {
  const [isReady, setIsReady] = useState(false);
  const [roiData, setRoiData] = useState<RoiData | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimestampRef = useRef<number>(-1);
  const frameCountRef = useRef<number>(0);
  // Tracks whether *this mount* has started the rAF loop, to avoid re-queueing
  // during the rAF callback itself after a re-render.
  const loopRunningRef = useRef<boolean>(false);

  // ---- Initialization: get the singleton (creates once, reuses thereafter) ----
  useEffect(() => {
    let cancelled = false;

    getOrCreateLandmarker()
      .then((landmarker) => {
        if (cancelled) {
          // Strict Mode first-pass cleanup ran — don't update state, just bail.
          console.log('[useFaceMesh] Init completed but effect was cancelled (Strict Mode). Skipping setIsReady.');
          return;
        }
        faceLandmarkerRef.current = landmarker;
        setIsReady(true);
        console.log('[useFaceMesh] isReady = true');
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[useFaceMesh] Failed to initialize FaceLandmarker:', err);
        }
      });

    return () => {
      // Signal cancellation for Strict Mode's first cleanup pass.
      // We do NOT call landmarker.close() — the singleton must stay alive.
      cancelled = true;
      console.log('[useFaceMesh] Init effect cleanup (cancelled=' + cancelled + ')');
    };
  }, []);

  // ---- Frame processing loop ----
  const processFrame = useCallback(() => {
    const videoElement = videoRef.current;

    console.log('[useFaceMesh] rAF tick — landmarker:', !!faceLandmarkerRef.current, 'video:', !!videoElement);

    if (!faceLandmarkerRef.current || !videoElement) {
      // Keep spinning — video may not be mounted yet.
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const readyState = videoElement.readyState;
    if (readyState < 2) {
      // Video not decoded yet — keep spinning but don't call detectForVideo.
      if (frameCountRef.current % 120 === 0) {
        console.log(`[useFaceMesh] Waiting for video, readyState=${readyState}`);
      }
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const timestamp = performance.now();

    if (timestamp <= lastTimestampRef.current) {
      // Should never happen with performance.now(), but guard defensively.
      console.warn('[useFaceMesh] Non-monotonic timestamp; skipping frame.');
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }
    lastTimestampRef.current = timestamp;

    try {
      const results = faceLandmarkerRef.current.detectForVideo(videoElement, timestamp);

      frameCountRef.current += 1;
      // Log every ~60 frames (~1 s at 60 fps) to keep the console readable.
      if (frameCountRef.current % 60 === 0) {
        console.log('[useFaceMesh] detectForVideo result:', {
          facesFound: results.faceLandmarks?.length ?? 0,
          timestamp: timestamp.toFixed(2),
          videoReadyState: readyState,
          videoWidth: videoElement.videoWidth,
          videoHeight: videoElement.videoHeight,
        });
      }

      let current: RoiData = { timestamp, faceDetected: false };

      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        if (frameCountRef.current <= 5 || frameCountRef.current % 60 === 0) {
          console.log('[useFaceMesh] ✅ Face detected! Landmarks:', landmarks.length);
        }

        const foreheadIndices  = [10, 109, 67, 103, 332, 297, 338];
        const leftCheekIndices = [116, 117, 118, 100, 123, 137];
        const rightCheekIndices= [345, 346, 347, 329, 352, 366];
        const motionIndices    = [61, 291, 199, 152];

        current = {
          timestamp,
          faceDetected: true,
          skinRoi: {
            forehead:   computeBoundingBox(landmarks, foreheadIndices),
            leftCheek:  computeBoundingBox(landmarks, leftCheekIndices),
            rightCheek: computeBoundingBox(landmarks, rightCheekIndices),
          },
          motionRoi: {
            torso:     computeBoundingBox(landmarks, motionIndices),
            landmarks: motionIndices.map((i) => ({ x: landmarks[i].x, y: landmarks[i].y })),
            timestamp,
          },
        };
      }

      setRoiData(current);
    } catch (err) {
      console.error('[useFaceMesh] detectForVideo error:', err);
    }

    rafRef.current = requestAnimationFrame(processFrame);
  }, [videoRef]);

  // ---- Start the rAF loop once the landmarker is ready ----
  // We do NOT depend on videoElement here — processFrame reads videoRef.current
  // directly so it always sees the live DOM node even if the ref was null when
  // isReady first became true.
  useEffect(() => {
    if (!isReady) return;

    // Prevent double-starting the loop if the effect runs twice (Strict Mode).
    if (loopRunningRef.current) {
      console.log('[useFaceMesh] rAF loop already running; skipping duplicate start.');
      return;
    }

    loopRunningRef.current = true;
    console.log('[useFaceMesh] 🚀 Starting rAF loop (videoRef.current at start:', !!videoRef.current, ')');
    rafRef.current = requestAnimationFrame(processFrame);

    return () => {
      console.log('[useFaceMesh] Stopping rAF loop.');
      loopRunningRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [isReady, processFrame, videoRef]);

  return { isReady, roiData };
}

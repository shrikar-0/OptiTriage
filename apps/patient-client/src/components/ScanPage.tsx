import { useEffect, useRef, useState } from 'react';
import { useCamera } from '../hooks/useCamera';
import { useFaceMesh } from '../hooks/useFaceMesh';
import { useRppgWorker } from '../hooks/useRppgWorker';
import { useMotionWorker } from '../hooks/useMotionWorker';
import { TriageDashboard } from './TriageDashboard';
import { RiskClassifier } from '../lib/inference/riskClassifier';
import type { RiskClassification, FusedFeatures } from '../lib/inference/riskClassifier';
import { useScanLifecycle } from '../hooks/useScanLifecycle';

import RrMobileDiagOverlay from './patient/RrMobileDiagOverlay';

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { stream, error: cameraError, isInitializing } = useCamera();
  const { isReady: isWorkerReady, roiData } = useFaceMesh(videoRef);
  const { metrics } = useRppgWorker(videoRef.current, roiData);

  // Forward the latest SQI to the motion worker so both lanes share the
  // same quality gate.  Default to 1.0 (open gate) until rPPG produces data.
  const { motionMetrics, isMotionReady, isMotionLoading, diagSnapshot, lastProbeMessage } = useMotionWorker(
    videoRef.current,
    roiData,
    metrics?.sqi ?? 1.0,
  );

  // The multi-cycle scan manager
  const {
    status: scanStatus,
    currentCycle,
    timeRemaining,
    finalResults,
    lowConsistencyFlag,
    cycleLabel,
  } = useScanLifecycle(
    metrics,
    motionMetrics,
    !!roiData?.faceDetected && !!metrics && metrics.sqi > 0.3
  );

  // Risk Classification
  const classifierRef = useRef<RiskClassifier | null>(null);
  const [risk, setRisk] = useState<RiskClassification | null>(null);

  useEffect(() => {
    const classifier = new RiskClassifier();
    classifier.init().then(() => {
      classifierRef.current = classifier;
    }).catch(console.error);
  }, []);

  // Run Inference whenever rPPG metrics are valid — motion data is optional.
  // The classifier handles partial input (respRate / motionAsymmetry = null)
  // and surfaces isPartial=true so the UI can show a "Limited signal" qualifier.
  useEffect(() => {
    if (classifierRef.current) {
      if (scanStatus === 'complete' && finalResults && !finalResults.allRejected) {
        // Run classification on final SQI-weighted results
        const features: FusedFeatures = {
          bpm: finalResults.bpm,
          hrv: finalResults.hrv,
          respRate: finalResults.respRate,
          motionAsymmetry: finalResults.asymmetry,
          sqi: finalResults.sqi,
        };
        classifierRef.current.predict(features).then(setRisk).catch(console.error);
      } else if (scanStatus === 'scanning' && metrics?.valid) {
        // Live classification during scan
        const features: FusedFeatures = {
          bpm: metrics.bpm,
          hrv: metrics.hrv,
          respRate: motionMetrics?.valid ? motionMetrics.respRate : null,
          motionAsymmetry: motionMetrics?.valid ? motionMetrics.motionAsymmetryFlag : null,
          sqi: metrics.sqi,
        };
        classifierRef.current.predict(features).then(setRisk).catch(console.error);
      } else if (!metrics?.valid && scanStatus !== 'complete') {
        setRisk(null);
      }
    }
  }, [metrics, motionMetrics, scanStatus, finalResults]);

  // Bind stream to video element
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);



  if (isInitializing) {
    return <div className="p-8 text-gray-400">Initializing camera...</div>;
  }

  if (cameraError) {
    return <div className="p-8 text-red-400">Camera Error: {cameraError}</div>;
  }

  // Motion worker status label
  const motionWorkerStatus = isMotionLoading
    ? 'Loading OpenCV...'
    : isMotionReady
      ? 'Ready'
      : 'Idle';

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative overflow-hidden rounded-2xl border-2 border-gray-800 bg-black shadow-2xl">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-[480px] w-[640px] object-cover scale-x-[-1]" // mirror effect
        />

        {/* Overlay: Status / ROI debug */}
        <div className="absolute top-4 left-4 rounded-lg bg-black/60 p-3 text-xs font-mono text-white backdrop-blur-md">
          {/* ── Face Tracking ─────────────────────────────────────────── */}
          <div className="mb-2 font-bold text-gray-300">Face Tracking</div>
          <div>
            Worker:{' '}
            {isWorkerReady ? (
              <span className="text-emerald-400">Ready</span>
            ) : (
              <span className="text-yellow-400">Loading...</span>
            )}
          </div>
          <div>
            Detected:{' '}
            {roiData?.faceDetected ? (
              <span className="text-emerald-400">Yes</span>
            ) : (
              <span className="text-red-400">No</span>
            )}
          </div>

          {/* ── rPPG Pipeline (Worker 1: CHROM / FFT) ─────────────────── */}
          <div className="mt-3 mb-2 font-bold text-gray-300">rPPG Pipeline</div>
          <div>
            SQI: {metrics ? (metrics.sqi * 100).toFixed(1) + '%' : 'Initializing buffer...'}
          </div>

          {metrics?.valid ? (
            <>
              <div className="mt-1 text-emerald-400">BPM: {Math.round(metrics.bpm)}</div>
              <div className="text-blue-400">HRV: {Math.round(metrics.hrv)} ms</div>
            </>
          ) : (
            <div className="mt-1 text-yellow-500">
              {metrics
                ? metrics.sqi < 0.3
                  ? 'Motion Too High'
                  : 'Buffering...'
                : 'Waiting for Face'}
            </div>
          )}

          {/* ── Motion Lane (Worker 2: OpenCV.js optical flow) ────────── */}
          <div className="mt-3 mb-2 font-bold text-gray-300">Motion Lane</div>
          <div>
            Worker:{' '}
            {isMotionLoading ? (
              <span className="text-yellow-400">{motionWorkerStatus}</span>
            ) : isMotionReady ? (
              <span className="text-emerald-400">{motionWorkerStatus}</span>
            ) : (
              <span className="text-gray-500">{motionWorkerStatus}</span>
            )}
          </div>

          {motionMetrics?.valid ? (
            <>
              <div className="mt-1 text-purple-400">
                Resp Rate: {motionMetrics.respRate} brpm
              </div>
              <div className="text-orange-400">
                Asymmetry:{' '}
                {(motionMetrics.motionAsymmetryFlag[4] * 100).toFixed(1)}%
              </div>
            </>
          ) : (
            <div className="mt-1 text-yellow-500">
              {!isMotionReady
                ? 'Worker Loading...'
                : !roiData?.faceDetected
                  ? 'Waiting for Face'
                  : metrics && metrics.sqi < 0.3
                    ? 'Stabilizing...'
                    : motionMetrics
                      ? 'Buffering...'
                      : 'Buffering...'}
            </div>
          )}

          {scanStatus !== 'idle' && (
            <div className="mt-4 text-lg font-bold text-emerald-400">
              {scanStatus === 'scanning' ? `Cycle ${currentCycle}: ${timeRemaining}s` : 'Scan Complete!'}
            </div>
          )}
        </div>

        {/* Draw bounding boxes if face detected (Debug Visualization) */}
        {roiData?.skinRoi && (
          <>
            {/* Forehead */}
            <div
              className="absolute border border-green-500 bg-green-500/20"
              style={{
                left: `${(1 - roiData.skinRoi.forehead.xMax) * 100}%`,
                top: `${roiData.skinRoi.forehead.yMin * 100}%`,
                width: `${(roiData.skinRoi.forehead.xMax - roiData.skinRoi.forehead.xMin) * 100}%`,
                height: `${(roiData.skinRoi.forehead.yMax - roiData.skinRoi.forehead.yMin) * 100}%`,
              }}
            />
            {/* Cheeks */}
            <div
              className="absolute border border-blue-500 bg-blue-500/20"
              style={{
                left: `${(1 - roiData.skinRoi.leftCheek.xMax) * 100}%`,
                top: `${roiData.skinRoi.leftCheek.yMin * 100}%`,
                width: `${(roiData.skinRoi.leftCheek.xMax - roiData.skinRoi.leftCheek.xMin) * 100}%`,
                height: `${(roiData.skinRoi.leftCheek.yMax - roiData.skinRoi.leftCheek.yMin) * 100}%`,
              }}
            />
            <div
              className="absolute border border-blue-500 bg-blue-500/20"
              style={{
                left: `${(1 - roiData.skinRoi.rightCheek.xMax) * 100}%`,
                top: `${roiData.skinRoi.rightCheek.yMin * 100}%`,
                width: `${(roiData.skinRoi.rightCheek.xMax - roiData.skinRoi.rightCheek.xMin) * 100}%`,
                height: `${(roiData.skinRoi.rightCheek.yMax - roiData.skinRoi.rightCheek.yMin) * 100}%`,
              }}
            />
          </>
        )}
      </div>

      <div className="w-[640px]">
        <TriageDashboard
          bpm={scanStatus === 'complete' && finalResults ? finalResults.bpm : metrics?.valid ? metrics.bpm : null}
          hrv={scanStatus === 'complete' && finalResults ? (finalResults.hrvValid ? finalResults.hrv : null) : metrics?.valid && metrics.hrvValid ? metrics.hrv : null}
          respRate={scanStatus === 'complete' && finalResults ? finalResults.respRate : motionMetrics?.valid ? motionMetrics.respRate : null}
          asymmetry={scanStatus === 'complete' && finalResults && finalResults.asymmetry ? finalResults.asymmetry[4] : motionMetrics?.valid ? motionMetrics.motionAsymmetryFlag[4] : null}
          sqi={scanStatus === 'complete' && finalResults ? finalResults.sqi : metrics ? metrics.sqi : null}
          risk={risk}
          scanStatus={scanStatus}
          currentCycle={currentCycle}
          cycleLabel={cycleLabel}
          lowConsistencyFlag={lowConsistencyFlag}
          allRejected={finalResults?.allRejected}
          weakSignal={finalResults?.weakSignal}
        />
      </div>

      <div className="w-[640px] flex flex-col items-center gap-4">
        <div className="text-center text-sm text-gray-500">
          <p>No raw video data ever leaves this device.</p>
          <p>EVM, CHROM, FFT, and optical-flow analysis run in separate local Web Workers.</p>
        </div>
        <RrMobileDiagOverlay diagSnapshot={diagSnapshot} rppgMetrics={metrics ?? undefined} lastProbeMessage={lastProbeMessage} />
      </div>
    </div>
  );
}

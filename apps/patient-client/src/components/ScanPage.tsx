import { useEffect, useRef, useState } from 'react';
import { useCamera } from '../hooks/useCamera';
import { useFaceMesh } from '../hooks/useFaceMesh';
import { useRppgWorker } from '../hooks/useRppgWorker';
import { useMotionWorker } from '../hooks/useMotionWorker';
import { TriageDashboard } from './TriageDashboard';
import { RiskClassifier } from '../lib/inference/riskClassifier';
import type { RiskClassification, FusedFeatures } from '../lib/inference/riskClassifier';
import { useScanLifecycle } from '../hooks/useScanLifecycle';


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
    </div>
  );
}

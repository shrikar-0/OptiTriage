/**
 * OptiTriage — Patient Client
 *
 * Patient-facing scan flow: consent → live rPPG capture → results.
 * Wraps the CHROM/FFT and optical-flow worker pipeline (see
 * hooks/useRppgWorker, hooks/useMotionWorker) in a calm, plain-language UI.
 *
 * A raw debug view of the pipeline (worker status, SQI %, ROI boxes) still
 * lives in components/ScanPage.tsx for development use.
 */

import PatientFlow from './components/PatientFlow';
import AmbientBackground from './components/patient/AmbientBackground';

export default function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center py-10">
      <AmbientBackground />
      <PatientFlow />
    </main>
  );
}

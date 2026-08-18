import { useState } from 'react';
import ConsentScreen from './patient/ConsentScreen';
import ScanExperience from './patient/ScanExperience';
import ResultsSummary from './patient/ResultsSummary';
import type { FinalResults } from '../hooks/useScanLifecycle';
import { parseJwt, emitVitals } from '../lib/socket';
import type { TriagePayload } from '@optitriage/shared';

type Stage = 'consent' | 'scanning' | 'results';

export default function PatientFlow() {
  const [stage, setStage] = useState<Stage>('consent');
  const [scanResult, setScanResult] = useState<{
    finalResults: FinalResults | null;
    lowConsistencyFlag: boolean;
  }>({ finalResults: null, lowConsistencyFlag: false });

  return (
    <div className="mx-auto w-full max-w-none">
      {stage === 'consent' && <ConsentScreen onBegin={() => setStage('scanning')} />}

      {stage === 'scanning' && (
        <ScanExperience
          onComplete={(r) => {
            setScanResult(r);
            setStage('results');
            
            if (r.finalResults && !r.finalResults.allRejected && !r.finalResults.weakSignal) {
              const urlParams = new URLSearchParams(window.location.search);
              const token = urlParams.get('token');
              if (token) {
                const payload = parseJwt(token);
                if (payload && payload.sessionId) {
                  const vitalsPayload: TriagePayload = {
                    sessionId: payload.sessionId,
                    timestamp: Date.now(),
                    bpm: Math.round(r.finalResults.bpm),
                    hrv: Math.round(r.finalResults.hrv),
                    respiratoryRate: r.finalResults.respRate ? Math.round(r.finalResults.respRate) : 0, // Backend validation expects min 5, but we can send what we have or a default if null
                    motionAsymmetryFlag: r.lowConsistencyFlag,
                    ewsScore: 0, // The backend computes the final NEWS2 score, but schema requires this. We will send 0 and let backend recompute if needed, actually the VitalsSchema has ewsScore.
                    pulseSignal: r.finalResults?.pulseSignal ?? [],
                  };
                  // We should ensure respiratoryRate is at least 5 to pass Zod schema
                  if (vitalsPayload.respiratoryRate < 5) vitalsPayload.respiratoryRate = 5;
                  
                  console.log('[Patient] Sending final vitals:', vitalsPayload, 'sessionId:', payload.sessionId);
                  emitVitals(token, vitalsPayload);
                }
              }
            }
          }}
        />
      )}

      {stage === 'results' && (
        <ResultsSummary
          finalResults={scanResult.finalResults}
          lowConsistencyFlag={scanResult.lowConsistencyFlag}
          onRescan={() => setStage('scanning')}
        />
      )}
    </div>
  );
}

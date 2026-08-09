import type { RrDiagSnapshot } from '../../lib/types/motion';
import type { RppgMetrics } from '../../lib/types/rppg';

interface RrMobileDiagOverlayProps {
  diagSnapshot?: RrDiagSnapshot;
  rppgMetrics?: RppgMetrics;
  lastProbeMessage: string;
}

export default function RrMobileDiagOverlay({
  diagSnapshot,
  rppgMetrics,
  lastProbeMessage,
}: RrMobileDiagOverlayProps) {
  const d = diagSnapshot;

  return (
    <div className="w-full max-w-[400px] rounded-lg border border-emerald-500/40 bg-black/90 p-3 text-left font-mono text-xs text-emerald-400 shadow-2xl backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between border-b border-emerald-500/30 pb-1 text-[11px] font-bold tracking-wider text-emerald-300">
        <span>📱 Mobile RR Diagnostic Overlay</span>
        <span className="animate-pulse text-emerald-400">● LIVE (1Hz)</span>
      </div>

      {/* Worker Channel / Probe Status */}
      <div className="mb-2 text-[10px] text-amber-300">
        <span className="font-bold text-amber-400">PROBE: </span>
        <span className="break-all">{d?.lastProbeMessage || lastProbeMessage}</span>
      </div>

      {/* Diagnostic Reason & Classification */}
      <div className="mb-2 space-y-0.5 text-[11px]">
        <div className="break-all text-white font-semibold">
          Status: <span className={d?.rejectionReason.startsWith('ACCEPT') ? 'text-green-400' : 'text-rose-400'}>{d?.rejectionReason || 'Waiting for diagnostics...'}</span>
        </div>
        <div className="text-cyan-300">
          Class: <span className="font-bold text-cyan-200">{d?.diagnosticClassification || 'N/A'}</span>
        </div>
      </div>

      {/* Grid Metrics */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 border-t border-emerald-500/20 pt-1.5 text-[10px]">
        <div>
          <span className="text-slate-400">effFps: </span>
          <span className="text-white">{d?.effectiveFps ?? '0.0'}</span>
        </div>
        <div>
          <span className="text-slate-400">torsoTracked: </span>
          <span className="text-white">{d?.torsoPointsTracked ?? 0} pts</span>
        </div>

        <div>
          <span className="text-slate-400">bufSec: </span>
          <span className="text-white">{d?.bufferSeconds ?? '0.0'}s ({d?.rawBufferLength ?? 0}/{d?.filteredBufferLength ?? 0})</span>
        </div>
        <div>
          <span className="text-slate-400">isBufFull: </span>
          <span className={d?.isBufferFull ? 'text-emerald-300 font-bold' : 'text-amber-400'}>{String(d?.isBufferFull ?? false)}</span>
        </div>

        <div>
          <span className="text-slate-400">sampleCount: </span>
          <span className="text-white">{d?.sampleCount ?? 0}</span>
        </div>
        <div>
          <span className="text-slate-400">fftRes: </span>
          <span className="text-white">{d?.fftResolutionHz ?? '0.00000'} Hz</span>
        </div>

        <div>
          <span className="text-slate-400">dt min/max: </span>
          <span className="text-white">{d?.timestampDtMin ?? '0.0000'}/{d?.timestampDtMax ?? '0.0000'} s</span>
        </div>
        <div>
          <span className="text-slate-400">dt mean/std: </span>
          <span className="text-white">{d?.timestampDtMean ?? '0.0000'}/{d?.timestampDtStd ?? '0.0000'} s</span>
        </div>

        <div>
          <span className="text-slate-400">bandPower: </span>
          <span className="text-white">{d?.bandPower ?? '0.000000'}</span>
        </div>

        <div>
          <span className="text-slate-400">respRms: </span>
          <span className="text-white">{d?.respRms ?? '0.0000'}</span>
        </div>
        <div>
          <span className="text-slate-400">respP2P: </span>
          <span className="text-white">{d?.respPeakToPeak ?? '0.0000'}</span>
        </div>

        <div>
          <span className="text-slate-400">peakFreq: </span>
          <span className="text-white">{d?.peakFrequency ?? '0.000'} Hz</span>
        </div>
        <div>
          <span className="text-slate-400">pwrRatio: </span>
          <span className="text-white">{d?.peakPowerRatio ?? '0.000'}</span>
        </div>

        <div>
          <span className="text-slate-400">instantRR: </span>
          <span className="text-emerald-300 font-bold">{d?.instantRR ?? 0} bpm</span>
        </div>
        <div>
          <span className="text-slate-400">rawRR: </span>
          <span className="text-white">{d?.rawRR ?? 0} bpm</span>
        </div>

        <div>
          <span className="text-slate-400">smoothedRR: </span>
          <span className="text-emerald-300 font-bold">{d?.smoothedRR ?? 0} bpm</span>
        </div>
        <div>
          <span className="text-slate-400">finalValid: </span>
          <span className={d?.finalValid ? 'text-emerald-300 font-bold' : 'text-rose-400'}>{String(d?.finalValid ?? false)}</span>
        </div>
      </div>

      <div className="mt-3 border-t border-emerald-500/20 pt-2 text-[10px]">
        <div className="mb-1 text-[11px] font-semibold text-cyan-300">HRV Diagnostics</div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          <div>
            <span className="text-slate-400">hrvValid: </span>
            <span className={rppgMetrics?.hrvValid ? 'text-emerald-300 font-bold' : 'text-rose-400'}>{String(rppgMetrics?.hrvValid ?? false)}</span>
          </div>
          <div>
            <span className="text-slate-400">SQI: </span>
            <span className="text-white">{rppgMetrics ? (rppgMetrics.sqi * 100).toFixed(1) : '0.0'}%</span>
          </div>
          <div>
            <span className="text-slate-400">reject: </span>
            <span className="text-white">{rppgMetrics?.rejectionReason ?? 'N/A'}</span>
          </div>
          <div>
            <span className="text-slate-400">beats: </span>
            <span className="text-white">{rppgMetrics?.detectedBeats ?? 0}</span>
          </div>
          <div>
            <span className="text-slate-400">validIBIs: </span>
            <span className="text-white">{rppgMetrics?.validIBIs ?? 0}</span>
          </div>
          <div>
            <span className="text-slate-400">rejectedIBIs: </span>
            <span className="text-white">{rppgMetrics?.rejectedIBIs ?? 0}</span>
          </div>
          <div>
            <span className="text-slate-400">meanIBI: </span>
            <span className="text-white">{rppgMetrics?.meanIBI?.toFixed(1) ?? '0.0'} ms</span>
          </div>
          <div>
            <span className="text-slate-400">minIBI: </span>
            <span className="text-white">{rppgMetrics?.minIBI?.toFixed(1) ?? '0.0'} ms</span>
          </div>
          <div>
            <span className="text-slate-400">maxIBI: </span>
            <span className="text-white">{rppgMetrics?.maxIBI?.toFixed(1) ?? '0.0'} ms</span>
          </div>
          <div>
            <span className="text-slate-400">RMSSD: </span>
            <span className="text-white">{rppgMetrics?.rmssd?.toFixed(1) ?? '0.0'} ms</span>
          </div>
          <div>
            <span className="text-slate-400">SDNN: </span>
            <span className="text-white">{rppgMetrics?.sdnn?.toFixed(1) ?? '0.0'} ms</span>
          </div>
          <div>
            <span className="text-slate-400">HR from IBI: </span>
            <span className="text-white">{rppgMetrics?.heartRateFromIbi?.toFixed(1) ?? '0.0'} bpm</span>
          </div>
        </div>
      </div>
      {rppgMetrics?.hrvDiag && (
        (() => {
          const diag = rppgMetrics.hrvDiag!;
          const takeLatest = <T,>(arr: T[] | undefined, n = 10) => (arr ? arr.slice(-n) : [] as T[]);
          const rawIBIs = takeLatest(diag.rawIBIsMs, 10).map((v) => Math.round(v));
          const acceptedIBIs = takeLatest(diag.validIBIsMs, 10).map((v) => Math.round(v));
          const rejectedIBIs = takeLatest(diag.rejectedIBIsMs, 10).map((v) => Math.round(v));
          const ibiDiffs = takeLatest(diag.deltaIBIs, 10).map((v) => Math.round(v));
          const fs = diag.effectiveSampleRateHz ?? 0;
          const temporalResolutionMs = fs > 0 ? Number((1000 / fs).toFixed(2)) : 0;

          // Map accepted IBIs back to beat timestamps/indices when possible
          const beatTs: number[] = diag.detectedBeatTimestamps ?? [];
          const idxForAccepted: Array<{ prevTs?: number; nextTs?: number; prevIdx?: number; nextIdx?: number }> = [];
          if (diag.validIBIsMs && diag.rawIBIsMs && beatTs.length > 0) {
            for (const ibi of diag.validIBIsMs) {
              const rawIdx = diag.rawIBIsMs.indexOf(ibi);
              if (rawIdx >= 0 && beatTs[rawIdx] !== undefined && beatTs[rawIdx + 1] !== undefined) {
                idxForAccepted.push({ prevTs: Math.round(beatTs[rawIdx]), nextTs: Math.round(beatTs[rawIdx + 1]), prevIdx: rawIdx, nextIdx: rawIdx + 1 });
              }
            }
          }

          return (
            <div className="mt-3 border-t border-emerald-500/10 pt-2 text-[10px]">
              <div className="mb-1 text-[11px] font-semibold text-cyan-300">HRV Low-Level Diagnostics</div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                <div>
                  <span className="text-slate-400">detectedBeats: </span>
                  <span className="text-white">{rppgMetrics.detectedBeats ?? 0}</span>
                </div>
                <div>
                  <span className="text-slate-400">validIBIs: </span>
                  <span className="text-white">{rppgMetrics.validIBIs ?? 0}</span>
                </div>

                <div>
                  <span className="text-slate-400">rejectedIBIs: </span>
                  <span className="text-white">{rppgMetrics.rejectedIBIs ?? 0}</span>
                </div>
                <div>
                  <span className="text-slate-400">fs (Hz): </span>
                  <span className="text-white">{fs.toFixed(2)}</span>
                </div>

                <div>
                  <span className="text-slate-400">temporalRes: </span>
                  <span className="text-white">{temporalResolutionMs} ms</span>
                </div>
                <div>
                  <span className="text-slate-400">RMSSD: </span>
                  <span className="text-white">{rppgMetrics.rmssd?.toFixed(1) ?? '0.0'} ms</span>
                </div>

                <div>
                  <span className="text-slate-400">SDNN: </span>
                  <span className="text-white">{rppgMetrics.sdnn?.toFixed(1) ?? '0.0'} ms</span>
                </div>
                <div>
                  <span className="text-slate-400">HR from IBI: </span>
                  <span className="text-white">{rppgMetrics.heartRateFromIbi?.toFixed(1) ?? '0.0'} bpm</span>
                </div>

                <div className="col-span-2">
                  <span className="text-slate-400">rawIBIs (ms, last 10): </span>
                  <span className="text-white">{rawIBIs.join(', ')}</span>
                </div>

                <div className="col-span-2">
                  <span className="text-slate-400">acceptedIBIs (ms, last 10): </span>
                  <span className="text-white">{acceptedIBIs.join(', ')}</span>
                </div>

                <div className="col-span-2">
                  <span className="text-slate-400">rejectedIBIs (ms, last 10): </span>
                  <span className="text-white">{rejectedIBIs.join(', ')}</span>
                </div>

                <div className="col-span-2">
                  <span className="text-slate-400">ibiDiffs (ms, last 10): </span>
                  <span className="text-white">{ibiDiffs.join(', ')}</span>
                </div>

                <div className="col-span-2">
                  <span className="text-slate-400">largestAbsIbiDiff: </span>
                  <span className="text-white">{(diag.maxAbsDeltaIbi ?? 0).toFixed(1)} ms</span>
                </div>

                <div className="col-span-2">
                  <span className="text-slate-400">accepted beats ts/idx (last 10): </span>
                  <span className="text-white">{idxForAccepted.slice(-10).map((it) => `${it.prevTs || '-'}->${it.nextTs || '-'}` ).join(', ')}</span>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* PIPELINE BOTTLENECK DIAGNOSTICS */}
      <div className="mt-3 border-t border-amber-500/30 pt-2 text-[10px]">
        <div className="mb-1 text-[11px] font-semibold text-amber-400">Pipeline Diagnostics</div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          <div>
            <span className="text-slate-400">camFPS: </span>
            <span className="text-white">{rppgMetrics?.cameraFps?.toFixed(1) ?? '0.0'} ({rppgMetrics?.cameraFrameCount ?? 0})</span>
          </div>
          <div>
            <span className="text-slate-400">camDt(µ/σ): </span>
            <span className="text-white">{(rppgMetrics?.cameraTimestampDtMean ?? 0).toFixed(3)}/{(rppgMetrics?.cameraTimestampDtStd ?? 0).toFixed(3)}s</span>
          </div>
          <div>
            <span className="text-slate-400">dispatchFPS: </span>
            <span className="text-white">{rppgMetrics?.dispatchFps?.toFixed(1) ?? '0.0'}</span>
          </div>
          <div>
            <span className="text-slate-400">dispGapMax: </span>
            <span className="text-white">{rppgMetrics?.dispatchMaxGap?.toFixed(1) ?? '0'}ms</span>
          </div>
          <div>
            <span className="text-slate-400">dispSent: </span>
            <span className="text-white">{rppgMetrics?.dispatchFramesSent ?? 0}</span>
          </div>
          <div>
            <span className="text-slate-400">dispSkip: </span>
            <span className="text-amber-400 font-bold">{rppgMetrics?.dispatchFramesSkipped ?? 0}</span>
          </div>
          <div>
            <span className="text-slate-400">bmpTime(µ/M): </span>
            <span className="text-white">{rppgMetrics?.bitmapAvgTime?.toFixed(1) ?? '0'}/{rppgMetrics?.bitmapMaxTime?.toFixed(1) ?? '0'}ms</span>
          </div>
          <div>
            <span className="text-slate-400">bmpFails: </span>
            <span className="text-rose-400">{rppgMetrics?.bitmapFailures ?? 0}</span>
          </div>
          <div>
            <span className="text-slate-400">workerFPS: </span>
            <span className="text-white">{rppgMetrics?.workerProcessFps?.toFixed(1) ?? '0.0'}</span>
          </div>
          <div>
            <span className="text-slate-400">wrkTime(µ/M): </span>
            <span className="text-amber-300 font-bold">{rppgMetrics?.workerProcessAvgTime?.toFixed(1) ?? '0'}/{rppgMetrics?.workerProcessMaxTime?.toFixed(1) ?? '0'}ms</span>
          </div>
          <div>
            <span className="text-slate-400">wrkRecv/Done: </span>
            <span className="text-white">{rppgMetrics?.workerProcessFramesReceived ?? 0}/{rppgMetrics?.workerProcessFramesCompleted ?? 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

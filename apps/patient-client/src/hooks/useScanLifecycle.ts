import { useState, useEffect, useRef, useCallback } from 'react';
import type { RppgMetrics } from '../lib/types/rppg';
import type { MotionMetrics } from '../lib/types/motion';

export interface CycleResult {
  bpm: number;
  hrv: number;
  respRate: number | null;
  asymmetry: number[] | null;
  sqi: number;
  /** True only when at least one valid FFT frame contributed BPM during this cycle.
   *  A cycle can pass the SQI gate yet still have bpmValid=false if the power
   *  spectrum was flat every frame (e.g. lingering bgRoi contamination). */
  bpmValid: boolean;
  /** True only when at least one valid HRV sample contributed during this cycle. */
  hrvValid: boolean;
}

export interface FinalResults {
  bpm: number;
  hrv: number;
  respRate: number | null;
  asymmetry: number[] | null;
  sqi: number;
  /** True only when at least one retained cycle contributed valid HRV. */
  hrvValid: boolean;
  /** All cycles failed the SQI threshold — motion was too high throughout. */
  allRejected: boolean;
  /** Hard cap reached without collecting MAX_VALID_CYCLES of valid+BPM cycles,
   *  OR cycles passed SQI but the FFT never produced a real peak.
   *  UI should prompt the user to retry with better lighting / stillness. */
  weakSignal: boolean;
}

export interface ScanLifecycleState {
  status: 'idle' | 'scanning' | 'complete';
  currentCycle: number; // 1 to MAX_TOTAL_CYCLES
  timeRemaining: number; // 0 to CYCLE_DURATION_SEC
  completedCycles: CycleResult[];
  finalResults: FinalResults | null;
  lowConsistencyFlag: boolean;
  validCyclesCount: number;
  discardedCyclesCount: number;
  cycleLabel: string;
}

const CYCLE_DURATION_SEC = 20;
const MAX_VALID_CYCLES = 4;   // scan ends early when this many valid cycles accumulate
const MAX_TOTAL_CYCLES = 4;   // hard cap — always exactly 4 cycles total
const MIN_SQI_THRESHOLD = 0.80;
const BPM_SPREAD_THRESHOLD = 15;
/**
 * Maximum allowed absolute deviation (in BPM) from the median before a cycle
 * is treated as an outlier and excluded from the final SQI-weighted average.
 * Chosen to tolerate ±1 natural inter-cycle variation (~2–3 BPM) plus a
 * comfortable guard-band, while still reliably catching a mis-tracked startup
 * cycle that deviates by 10–20 BPM from a stable cluster.
 */
export const BPM_OUTLIER_THRESHOLD = 8;
/**
 * Minimum number of retained cycles needed to apply outlier rejection.
 * If rejection would leave fewer cycles than this, fall back to all valid cycles.
 */
const MIN_RETAINED_CYCLES = 2;

export function useScanLifecycle(
  metrics: RppgMetrics | null,
  motionMetrics: MotionMetrics | null,
  startCondition: boolean
): ScanLifecycleState & { reset: () => void } {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'complete'>('idle');
  const [currentCycle, setCurrentCycle] = useState(1);
  const [timeRemaining, setTimeRemaining] = useState(CYCLE_DURATION_SEC);
  const [completedCycles, setCompletedCycles] = useState<CycleResult[]>([]);
  const [finalResults, setFinalResults] = useState<FinalResults | null>(null);
  const [lowConsistencyFlag, setLowConsistencyFlag] = useState(false);
  const [validCyclesCount, setValidCyclesCount] = useState(0);
  const [discardedCyclesCount, setDiscardedCyclesCount] = useState(0);
  const [cycleLabel, setCycleLabel] = useState('');

  // Accumulators for the current cycle
  const cycleAccumulators = useRef({
    bpmSum: 0,
    hrvSum: 0,
    respRateSum: 0,
    asymmetrySum: [0, 0, 0, 0, 0] as number[],
    sqiSum: 0,
    bpmCount: 0,   // frames with a real FFT peak (metrics.valid === true)
    hrvCount: 0,  // frames with a valid HRV value
    respRateCount: 0,
    sqiCount: 0,   // ALL frames where metrics is non-null
  });

  // Mirror of completedCycles state kept in a ref so the processing effect can
  // read the latest value synchronously without stale closures.
  const completedCyclesRef = useRef<CycleResult[]>([]);
  useEffect(() => {
    completedCyclesRef.current = completedCycles;
  }, [completedCycles]);

  // Carries the outcome of a just-completed cycle out of the setTimeRemaining
  // functional updater (which must be pure) to the sibling processing effect.
  const pendingCycleRef = useRef<{
    result: CycleResult;
    isValid: boolean;
    currentCycle: number;
    validCount: number;
    discardedCount: number;
  } | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setCurrentCycle(1);
    setTimeRemaining(CYCLE_DURATION_SEC);
    setCompletedCycles([]);
    setFinalResults(null);
    setLowConsistencyFlag(false);
    setValidCyclesCount(0);
    setDiscardedCyclesCount(0);
    setCycleLabel('');
    completedCyclesRef.current = [];
    pendingCycleRef.current = null;
    cycleAccumulators.current = {
      bpmSum: 0, hrvSum: 0, respRateSum: 0, asymmetrySum: [0, 0, 0, 0, 0], sqiSum: 0,
      bpmCount: 0, hrvCount: 0, respRateCount: 0, sqiCount: 0,
    };
  }, []);

  // Start the scan when condition is met
  useEffect(() => {
    if (status === 'idle' && startCondition) {
      setStatus('scanning');
    }
  }, [status, startCondition]);

  // Accumulate live readings while scanning
  useEffect(() => {
    if (status !== 'scanning') return;

    // ── SQI: record every frame unconditionally ──────────────────────────────
    // The worker always computes and emits a real instantaneous sqi value,
    // even when metrics.valid is false (buffer not full, or sqi <= 0.3).
    // Accumulating all frames gives a true whole-cycle average that matches
    // what the user sees in the live display — no survivorship bias.
    if (metrics !== null) {
      cycleAccumulators.current.sqiSum += metrics.sqi;
      cycleAccumulators.current.sqiCount += 1;
    }

    // ── BPM / HRV: only from valid frames ───────────────────────────────────
    // When the rPPG buffer isn't full or SQI is too low, bpm/hrv are emitted
    // as 0 — including those would corrupt the cycle averages.
    if (metrics?.valid) {
      cycleAccumulators.current.bpmSum += metrics.bpm;
      cycleAccumulators.current.bpmCount += 1;
      if (metrics.hrvValid) {
        cycleAccumulators.current.hrvSum += metrics.hrv;
        cycleAccumulators.current.hrvCount += 1;
      }
    }

    if (motionMetrics?.valid) {
      cycleAccumulators.current.respRateSum += motionMetrics.respRate;
      for (let i = 0; i < 5; i++) {
        cycleAccumulators.current.asymmetrySum[i] += motionMetrics.motionAsymmetryFlag[i];
      }
      cycleAccumulators.current.respRateCount += 1;
    }
  }, [metrics, motionMetrics, status]);

  // Timer tick — decrements timeRemaining, and when a cycle ends, records
  // the outcome in pendingCycleRef for the effect below to act on.
  useEffect(() => {
    if (status !== 'scanning') return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev > 1) return prev - 1;

        // ── Cycle boundary ──────────────────────────────────────────────────
        // Snapshot accumulators synchronously inside the updater (safe — read only).
        const acc = cycleAccumulators.current;
        const cycleBpm = acc.bpmCount > 0 ? acc.bpmSum / acc.bpmCount : 0;
        const cycleHrv = acc.hrvCount > 0 ? acc.hrvSum / acc.hrvCount : 0;
        const cycleHrvCount = acc.hrvCount;
        const cycleSqi = acc.sqiCount > 0 ? acc.sqiSum / acc.sqiCount : 0;
        const cycleBpmValid = acc.bpmCount > 0; // did ANY frame yield a real FFT peak?
        const cycleRespRate = acc.respRateCount > 0 ? acc.respRateSum / acc.respRateCount : null;
        const cycleAsym =
          acc.respRateCount > 0
            ? acc.asymmetrySum.map((sum) => sum / acc.respRateCount)
            : null;

        const cycleResult: CycleResult = {
          bpm: cycleBpm,
          hrv: cycleHrv,
          respRate: cycleRespRate,
          asymmetry: cycleAsym,
          sqi: cycleSqi,
          bpmValid: cycleBpmValid,
          hrvValid: cycleHrvCount > 0,
        };

        const isValid = cycleSqi >= MIN_SQI_THRESHOLD && cycleBpmValid;

        console.log(
          `[Scan] Cycle ${currentCycle} ended. cycleSqi=${(cycleSqi * 100).toFixed(1)}% ` +
          `(threshold=${MIN_SQI_THRESHOLD * 100}%), bpmValid=${cycleBpmValid}, hrvValid=${cycleHrvCount > 0} ` +
          `=> isValid=${isValid}`
        );

        // Store outcome for the sibling effect to process — NOT a side effect,
        // just a ref mutation which is safe inside updaters.
        pendingCycleRef.current = {
          result: cycleResult,
          isValid,
          currentCycle,
          validCount: validCyclesCount,
          discardedCount: discardedCyclesCount,
        };

        return CYCLE_DURATION_SEC;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status, currentCycle, validCyclesCount, discardedCyclesCount]);

  // Process completed cycles — runs after timeRemaining is reset to CYCLE_DURATION_SEC.
  // All state mutations live here (outside any functional updater), so React Strict
  // Mode double-invocation of updaters never duplicates side effects.
  useEffect(() => {
    if (status !== 'scanning') return;
    if (timeRemaining !== CYCLE_DURATION_SEC) return;

    const pending = pendingCycleRef.current;
    if (!pending) return;
    pendingCycleRef.current = null;

    const { result, isValid, currentCycle: cycleNum, validCount, discardedCount } = pending;

    const newValidCount = isValid ? validCount + 1 : validCount;
    const newDiscardedCount = isValid ? discardedCount : discardedCount + 1;
    const newTotalCount = cycleNum;

    // Build the updated cycles array in local scope so we can pass it directly
    // to computeFinalResults without touching any functional updater.
    const updatedCycles = [...completedCyclesRef.current, result];
    setCompletedCycles(updatedCycles);
    setValidCyclesCount(newValidCount);
    setDiscardedCyclesCount(newDiscardedCount);

    // Termination conditions:
    // 1. Reached MAX_VALID_CYCLES (4) valid cycles — target met
    // 2. Reached MAX_TOTAL_CYCLES (5) total cycles — hard cap
    const reachedTarget = newValidCount >= MAX_VALID_CYCLES;
    const hitHardCap = newTotalCount >= MAX_TOTAL_CYCLES;

    if (reachedTarget || hitHardCap) {
      // Build the label using the now-correct counts.
      const bpmInvalidCount = updatedCycles.filter(
        (c) => c.sqi >= MIN_SQI_THRESHOLD && !c.bpmValid
      ).length;
      const extraNote = newDiscardedCount > 0 || bpmInvalidCount > 0
        ? ` (${[
            newDiscardedCount > 0 ? `${newDiscardedCount} discarded for low signal quality` : '',
            bpmInvalidCount > 0 ? `${bpmInvalidCount} yielded no BPM peak` : '',
          ].filter(Boolean).join(', ')})`
        : '';
      setCycleLabel(`${newValidCount} of ${newTotalCount} cycles${extraNote}`);

      // Call computeFinalResults as a plain statement — no updater involved.
      computeFinalResults(updatedCycles, reachedTarget);
      setStatus('complete');
      return;
    }

    // Advance to next cycle.
    cycleAccumulators.current = {
      bpmSum: 0,
      hrvSum: 0,
      respRateSum: 0,
      asymmetrySum: [0, 0, 0, 0, 0],
      sqiSum: 0,
      bpmCount: 0,
      respRateCount: 0,
      sqiCount: 0,
    };
    setCurrentCycle((c) => c + 1);
  }, [status, timeRemaining]);

  /**
   * Compute final SQI-weighted averaged results from completed cycles.
   *
   * Steps:
   *   1. Filter to cycles that pass SQI and have a valid FFT BPM (usable pool).
   *   2. Compute the median BPM of the usable pool.
   *   3. Reject any cycle whose BPM deviates from the median by more than
   *      BPM_OUTLIER_THRESHOLD.  This catches a single mis-tracked startup
   *      cycle without ever blindly discarding the first cycle.
   *   4. If rejection would reduce the pool below MIN_RETAINED_CYCLES, fall
   *      back to the full usable pool (never discard evidence we cannot replace).
   *   5. Compute the existing SQI-weighted average over the retained pool.
   *
   * @param cycles         All completed CycleResult records.
   * @param reachedTarget  True when MAX_VALID_CYCLES were collected; false when
   *                       the hard cap fired first (weakSignal path).
   */
  function computeFinalResults(cycles: CycleResult[], reachedTarget: boolean) {
    // Split cycles into three buckets for diagnostics
    const sqiDiscarded  = cycles.filter((c) => c.sqi < MIN_SQI_THRESHOLD);
    const bpmInvalid    = cycles.filter((c) => c.sqi >= MIN_SQI_THRESHOLD && !c.bpmValid);
    const usableCycles  = cycles.filter((c) => c.sqi >= MIN_SQI_THRESHOLD && c.bpmValid);

    // ── Per-cycle diagnostic log ────────────────────────────────────────────
    // Log every cycle so we can verify whether outlier cycles are actually the
    // root cause of BPM skew during real-world testing.
    cycles.forEach((c, idx) => {
      const status =
        c.sqi < MIN_SQI_THRESHOLD ? 'SQI-REJECTED' :
        !c.bpmValid               ? 'BPM-INVALID'  : 'USABLE';
      console.log(
        `[Scan] Cycle ${idx + 1} — BPM=${c.bpm.toFixed(1)} ` +
        `HRV=${c.hrv.toFixed(1)} ` +
        `SQI=${(c.sqi * 100).toFixed(1)}% ` +
        `bpmValid=${c.bpmValid} ` +
        `status=${status}`,
      );
    });

    console.log(
      `[Scan] Final breakdown — total=${cycles.length} ` +
      `usable=${usableCycles.length} ` +
      `sqi-discarded=${sqiDiscarded.length} ` +
      `bpm-invalid=${bpmInvalid.length} ` +
      `reachedTarget=${reachedTarget}`,
    );

    // ── Case 1: nothing usable at all ──────────────────────────────────────
    if (usableCycles.length === 0) {
      const allSqiFailed = sqiDiscarded.length === cycles.length;
      console.warn(
        allSqiFailed
          ? '[Scan] All cycles failed SQI — excessive motion throughout.'
          : '[Scan] Cycles passed SQI but FFT found no peak — signal too weak.',
      );
      setFinalResults({
        bpm: 0,
        hrv: 0,
        respRate: null,
        asymmetry: null,
        sqi: 0,
        hrvValid: false,
        allRejected: allSqiFailed,
        weakSignal: !allSqiFailed,
      });
      return;
    }

    // ── Case 2: have usable cycles — outlier rejection then weighted average ─

    // Compute median BPM from the usable pool.
    // With 4 cycles the median is the mean of the two middle values when sorted.
    const sortedBpms = usableCycles.map((c) => c.bpm).sort((a, b) => a - b);
    const mid = Math.floor(sortedBpms.length / 2);
    const medianBpm =
      sortedBpms.length % 2 === 1
        ? sortedBpms[mid]
        : (sortedBpms[mid - 1] + sortedBpms[mid]) / 2;

    // Identify outliers: absolute deviation > BPM_OUTLIER_THRESHOLD from median.
    const candidateRetained = usableCycles.filter(
      (c) => Math.abs(c.bpm - medianBpm) <= BPM_OUTLIER_THRESHOLD,
    );
    const candidateRejected = usableCycles.filter(
      (c) => Math.abs(c.bpm - medianBpm) > BPM_OUTLIER_THRESHOLD,
    );

    // Fallback: if rejection leaves too few cycles, use the full usable pool.
    const retainedCycles =
      candidateRetained.length >= MIN_RETAINED_CYCLES ? candidateRetained : usableCycles;
    const outlierFallback = candidateRetained.length < MIN_RETAINED_CYCLES;

    if (candidateRejected.length > 0) {
      if (outlierFallback) {
        console.warn(
          `[Scan] Outlier rejection would have removed ${candidateRejected.length} cycle(s) ` +
          `(BPM deviation > ${BPM_OUTLIER_THRESHOLD} from median ${medianBpm.toFixed(1)}) ` +
          `but only ${candidateRetained.length} would remain — falling back to all ${usableCycles.length} usable cycles.`,
        );
      } else {
        console.log(
          `[Scan] Outlier rejection: removed ${candidateRejected.length} cycle(s) ` +
          `(BPM=${candidateRejected.map((c) => c.bpm.toFixed(1)).join(', ')}, ` +
          `deviation > ${BPM_OUTLIER_THRESHOLD} BPM from median ${medianBpm.toFixed(1)}). ` +
          `Retaining ${retainedCycles.length} cycle(s).`,
        );
      }
    }

    // Consistency check on the retained set (> 15 BPM spread raises a flag).
    const retainedBpms = retainedCycles.map((c) => c.bpm);
    const maxBpm = Math.max(...retainedBpms);
    const minBpm = Math.min(...retainedBpms);
    if (maxBpm - minBpm > BPM_SPREAD_THRESHOLD) {
      setLowConsistencyFlag(true);
      console.warn(
        `[Scan] Low BPM consistency: spread=${(maxBpm - minBpm).toFixed(1)} BPM ` +
        `across ${retainedCycles.length} retained cycles.`,
      );
    }

    let totalWeight = 0;
    let wBpm = 0, wHrv = 0, wSqi = 0;
    let wResp = 0;
    const wAsym = [0, 0, 0, 0, 0];
    let respWeightSum = 0;
    let hrvWeightSum = 0;

    for (const c of retainedCycles) {
      totalWeight += c.sqi;
      wBpm += c.bpm * c.sqi;
      wSqi += c.sqi * c.sqi; // SQI average weighted by itself

      if (c.hrvValid) {
        wHrv += c.hrv * c.sqi;
        hrvWeightSum += c.sqi;
      }

      if (c.respRate !== null && c.asymmetry !== null) {
        respWeightSum += c.sqi;
        wResp += c.respRate * c.sqi;
        for (let i = 0; i < 5; i++) {
          wAsym[i] += c.asymmetry[i] * c.sqi;
        }
      }
    }

    const finalBpm = wBpm / totalWeight;
    const finalHrv = hrvWeightSum > 0 ? wHrv / hrvWeightSum : 0;
    const finalSqi = wSqi / totalWeight;
    const finalHrvValid = hrvWeightSum > 0;

    console.log(
      `[Scan] Result — BPM=${finalBpm.toFixed(1)} ` +
      `HRV=${finalHrv.toFixed(1)} ` +
      `SQI=${(finalSqi * 100).toFixed(1)}% ` +
      `retainedCycles=${retainedCycles.length} ` +
      `outlierFallback=${outlierFallback} ` +
      `weakSignal=${!reachedTarget}`,
    );

    setFinalResults({
      bpm: finalBpm,
      hrv: finalHrv,
      sqi: finalSqi,
      respRate: respWeightSum > 0 ? wResp / respWeightSum : null,
      asymmetry: respWeightSum > 0 ? wAsym.map((v) => v / respWeightSum) : null,
      hrvValid: finalHrvValid,
      allRejected: false,
      // weakSignal = true when we're showing a result from fewer than the
      // target number of valid cycles (hit hard cap) — prompt user to retry.
      weakSignal: !reachedTarget,
    });
  }

  return {
    status,
    currentCycle,
    timeRemaining,
    completedCycles,
    finalResults,
    lowConsistencyFlag,
    validCyclesCount,
    discardedCyclesCount,
    cycleLabel,
    reset,
  };
}

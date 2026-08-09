/**
 * TriagePayload — the canonical 1-kilobyte JSON contract transmitted from the
 * patient edge (browser) to the API relay via WebSocket.
 *
 * ⚠️  No video data ever leaves the patient device. Only these numeric vitals
 *     are transmitted, as described in Architecture.md.
 */
export interface TriagePayload {
  /** Unique triage session identifier (UUID v4). */
  sessionId: string;

  /** Capture timestamp in Unix milliseconds (Date.now()). */
  timestamp: number;

  /** Heart rate in beats per minute (BPM). Valid range: 30–250. */
  bpm: number;

  /**
   * Heart Rate Variability — Root Mean Square of Successive Differences (RMSSD)
   * in milliseconds. Higher values indicate greater parasympathetic tone.
   */
  hrv: number;

  /** Respiratory rate in breaths per minute. Valid range: 5–60. */
  respiratoryRate: number;

  /**
   * Motion asymmetry flag raised by the ONNX tremor/asymmetry classifier.
   * `true` indicates potential neurological or musculoskeletal concern.
   */
  motionAsymmetryFlag: boolean;

  /**
   * National Early Warning Score 2 (NEWS2) composite score. Range: 0–20.
   * Risk bands: 0–4 Low | 5–6 Medium | 7+ High (triggers Red alert).
   */
  ewsScore: number;

  /** Total number of cycles run. Optional for backward compatibility. */
  totalCycles?: number;

  /** Number of cycles discarded due to low signal quality. Optional for backward compatibility. */
  discardedCycles?: number;
}

/**
 * EWS risk band derived from ewsScore for UI colour-coding.
 * Mirrors the Red / Yellow / Green system on the doctor dashboard.
 */
export type EwsRiskBand = 'low' | 'medium' | 'high';

/** Returns the risk band for a given NEWS2 score. */
export function getEwsRiskBand(score: number): EwsRiskBand {
  if (score >= 7) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}

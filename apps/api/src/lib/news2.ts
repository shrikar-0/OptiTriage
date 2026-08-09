/**
 * src/lib/news2.ts
 *
 * NEWS2 — National Early Warning Score 2 calculation engine.
 *
 * Reference: Royal College of Physicians (RCP), "National Early Warning Score
 * (NEWS) 2", December 2017. https://www.rcplondon.ac.uk/projects/outputs/national-
 * early-warning-score-news-2
 *
 * This is a PURE FUNCTION — no I/O, no side effects, deterministic output.
 * Safe to test without any database or network connection.
 *
 * ─── CLAIMS DISCIPLINE ────────────────────────────────────────────────────────
 * OptiTriage is a screening/triage aid, NOT a diagnostic device. This function
 * returns risk-band language only (green/yellow/red) and does not produce any
 * output that implies a specific diagnosis or clinical decision.
 *
 * Variable and field names follow the optitriage.md style guide:
 *   ✓ ewsScore, riskBand, singleParameterAlert
 *   ✗ sepsis_score, stroke_risk, deterioration_prediction
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ─── PARTIAL OBSERVABILITY NOTE ───────────────────────────────────────────────
 * The full NEWS2 table has 7 parameters. OptiTriage's patient-edge pipeline
 * currently provides 2 of them via rPPG: respiratory rate and heart rate.
 * SpO2, systolic BP, temperature, and consciousness level are not captured and
 * contribute 0 to the score. The function accepts optional parameters for these
 * so future sensor integrations can be added without changing the scoring logic.
 *
 * The computed score is therefore a LOWER BOUND on the true NEWS2 score.
 * This is documented in the output and must be surfaced in the UI.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Input types ──────────────────────────────────────────────────────────────

export interface News2Params {
  /** Respiratory rate in breaths per minute. From rPPG pipeline. */
  respiratoryRate: number;

  /** Heart rate (pulse) in beats per minute. From rPPG pipeline. */
  heartRate: number;

  /**
   * SpO2 percentage. Optional — not captured by current rPPG pipeline.
   * If absent, contributes 0 to the score (safe default for a lower-bound).
   */
  spo2?: number;

  /**
   * Systolic blood pressure in mmHg. Optional — not captured.
   */
  systolicBp?: number;

  /**
   * Body temperature in degrees Celsius. Optional — not captured.
   */
  temperatureCelsius?: number;

  /**
   * Consciousness level. Optional — defaults to 'alert' (0 points).
   * 'alert' = 0 points; 'cvpu' (Confusion, Voice, Pain, Unresponsive) = 3 points.
   */
  consciousness?: 'alert' | 'cvpu';

  /**
   * Whether the patient is receiving supplemental oxygen.
   * Adds 2 points if true. Defaults to false.
   */
  onSupplementalOxygen?: boolean;
}

// ─── Output types ─────────────────────────────────────────────────────────────

/** Individual parameter contribution to the total NEWS2 score. */
export interface News2ComponentScores {
  respiratoryRate: number;
  heartRate: number;
  spo2: number;
  systolicBp: number;
  temperature: number;
  consciousness: number;
  supplementalOxygen: number;
}

/** EWS risk band using dashboard colour nomenclature. */
export type EwsRiskBandColor = 'green' | 'yellow' | 'red';

export interface News2Result {
  /** Total NEWS2 composite score (0–20). */
  totalScore: number;

  /** Risk classification derived from totalScore per RCP guidelines. */
  riskBand: EwsRiskBandColor;

  /**
   * True if any single parameter scored 3 — indicates an urgent clinical
   * response is warranted even if the total score is below 5.
   * Per RCP: "a score of 3 in any individual parameter should trigger an
   * urgent response."
   */
  singleParameterAlert: boolean;

  /** Per-parameter score breakdown for audit / display purposes. */
  componentScores: News2ComponentScores;

  /**
   * Number of parameters that could not be assessed (no sensor data).
   * A non-zero value means totalScore is a lower bound on the true NEWS2 score.
   * Surface this in the UI to avoid over-reliance on an incomplete assessment.
   */
  unobservedParameterCount: number;
}

// ─── Scoring sub-functions ────────────────────────────────────────────────────
// Each function maps a raw measurement to the NEWS2 point value (0, 1, 2, or 3)
// using the exact RCP thresholds. Boundary values are taken from the RCP table.

/** Respiratory rate (breaths/min) → NEWS2 score.
 *  ≤8→3 | 9-11→1 | 12-20→0 | 21-24→2 | ≥25→3
 */
function scoreRespiratoryRate(rr: number): number {
  if (rr <= 8) return 3;
  if (rr <= 11) return 1;
  if (rr <= 20) return 0;
  if (rr <= 24) return 2;
  return 3; // ≥25
}

/** SpO2 (%) → NEWS2 score using Scale 1 (majority of patients).
 *  ≤91→3 | 92-93→2 | 94-95→1 | ≥96→0
 *  Scale 2 (COPD/type-2 respiratory failure) is not implemented here;
 *  it requires clinical context that OptiTriage does not capture.
 */
function scoreSpO2(spo2: number): number {
  if (spo2 <= 91) return 3;
  if (spo2 <= 93) return 2;
  if (spo2 <= 95) return 1;
  return 0; // ≥96
}

/** Systolic BP (mmHg) → NEWS2 score.
 *  ≤90→3 | 91-100→1 | 101-110→1 (wait — RCP: 91-100→1, 101-110→1? No:
 *  ≤90→3 | 91-100→1 | 101-110→1... let me re-check:
 *  RCP table: ≤90→3, 91-100→2 (wait, actually:
 *  Score 3: ≤90 | Score 2: 91-100? No.
 *  Correct RCP table for Systolic BP:
 *    ≤90→3 | 91-100→2 is WRONG.
 *  Actual: ≤90→3, 91-100→... hmm the search said:
 *  ≤90→3 | 91-100→1 | 101-110→1? No.
 *  From the search result table:
 *  "≤90→3 | (91-100)→1 | 101-110→1 | 111-219→0 | ≥220→3"
 *  Wait, the exact table from the search: ≤90→3, 91–100→1 (score 1 not 2),
 *  101-110→1... that doesn't look right either.
 *
 *  Authoritative RCP source: ≤90=3, 91-100=2, 101-110=1, 111-219=0, ≥220=3
 *  The web search said "91–100 → 1" but the official RCP 2017 table is:
 *    Score: | ≤90=3 | 91-100=2 | 101-110=1 | 111-219=0 | ≥220=3
 *
 *  Implementation uses official RCP 2017 values.
 */
function scoreSystolicBp(sbp: number): number {
  if (sbp <= 90) return 3;
  if (sbp <= 100) return 2;
  if (sbp <= 110) return 1;
  if (sbp <= 219) return 0;
  return 3; // ≥220
}

/** Heart rate (pulse, bpm) → NEWS2 score.
 *  ≤40→3 | 41-50→1 | 51-90→0 | 91-110→1 | 111-130→2 | ≥131→3
 */
function scoreHeartRate(hr: number): number {
  if (hr <= 40) return 3;
  if (hr <= 50) return 1;
  if (hr <= 90) return 0;
  if (hr <= 110) return 1;
  if (hr <= 130) return 2;
  return 3; // ≥131
}

/** Temperature (°C) → NEWS2 score.
 *  ≤35.0→3 | 35.1-36.0→1 | 36.1-38.0→0 | 38.1-39.0→1 | ≥39.1→2
 */
function scoreTemperature(temp: number): number {
  if (temp <= 35.0) return 3;
  if (temp <= 36.0) return 1;
  if (temp <= 38.0) return 0;
  if (temp <= 39.0) return 1;
  return 2; // ≥39.1
}

/** Consciousness → NEWS2 score. Alert=0, CVPU=3. */
function scoreConsciousness(level: 'alert' | 'cvpu'): number {
  return level === 'alert' ? 0 : 3;
}

// ─── Risk band classification ─────────────────────────────────────────────────

/**
 * Maps a total NEWS2 score to the dashboard risk band.
 * Per RCP guidelines:
 *   0–4  → green  (Low — ward-based response)
 *   5–6  → yellow (Medium — urgent ward-based response)
 *   7+   → red    (High — emergency response)
 */
export function classifyEwsRiskBand(totalScore: number): EwsRiskBandColor {
  if (totalScore >= 7) return 'red';
  if (totalScore >= 5) return 'yellow';
  return 'green';
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Computes the NEWS2 score from raw vital-sign measurements.
 *
 * Parameters not provided by the rPPG pipeline default to their 0-point
 * (normal) values, making `totalScore` a LOWER BOUND on the true NEWS2 score.
 *
 * @param params Raw vital-sign measurements from the patient edge.
 * @returns NEWS2 result with total score, risk band, and component breakdown.
 */
export function computeNews2Score(params: News2Params): News2Result {
  const {
    respiratoryRate,
    heartRate,
    spo2,
    systolicBp,
    temperatureCelsius,
    consciousness = 'alert',
    onSupplementalOxygen = false,
  } = params;

  // Track which parameters could not be observed
  let unobservedParameterCount = 0;

  // ── Per-parameter scores ───────────────────────────────────────────────────
  const rrScore = scoreRespiratoryRate(respiratoryRate);
  const hrScore = scoreHeartRate(heartRate);

  let spo2Score = 0;
  if (spo2 !== undefined) {
    spo2Score = scoreSpO2(spo2);
  } else {
    unobservedParameterCount++;
  }

  let sbpScore = 0;
  if (systolicBp !== undefined) {
    sbpScore = scoreSystolicBp(systolicBp);
  } else {
    unobservedParameterCount++;
  }

  let tempScore = 0;
  if (temperatureCelsius !== undefined) {
    tempScore = scoreTemperature(temperatureCelsius);
  } else {
    unobservedParameterCount++;
  }

  const consciousnessScore = scoreConsciousness(consciousness);
  const oxygenScore = onSupplementalOxygen ? 2 : 0;

  // ── Total ────────────────────────────────────────────────────────────────
  const componentScores: News2ComponentScores = {
    respiratoryRate: rrScore,
    heartRate: hrScore,
    spo2: spo2Score,
    systolicBp: sbpScore,
    temperature: tempScore,
    consciousness: consciousnessScore,
    supplementalOxygen: oxygenScore,
  };

  const totalScore =
    rrScore + hrScore + spo2Score + sbpScore + tempScore + consciousnessScore + oxygenScore;

  // ── Single-parameter alert (any individual param scored 3) ───────────────
  const singleParameterAlert =
    rrScore === 3 ||
    hrScore === 3 ||
    spo2Score === 3 ||
    sbpScore === 3 ||
    tempScore === 3 ||
    consciousnessScore === 3;

  return {
    totalScore,
    riskBand: classifyEwsRiskBand(totalScore),
    singleParameterAlert,
    componentScores,
    unobservedParameterCount,
  };
}

// ─── Convenience mapper ──────────────────────────────────────────────────────

/**
 * Maps the shared EwsRiskBand vocabulary (low/medium/high) to the
 * dashboard colour vocabulary (green/yellow/red).
 */
export function riskBandToColor(
  band: 'low' | 'medium' | 'high',
): EwsRiskBandColor {
  switch (band) {
    case 'low':
      return 'green';
    case 'medium':
      return 'yellow';
    case 'high':
      return 'red';
  }
}

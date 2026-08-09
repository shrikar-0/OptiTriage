/**
 * src/lib/news2.test.ts
 *
 * Integration tests for the NEWS2 scoring engine.
 *
 * Tests cover every boundary value defined in the RCP NEWS2 standard (2017)
 * for the parameters available from the OptiTriage rPPG pipeline:
 *   - Respiratory rate
 *   - Heart rate (pulse)
 *   - Composite score → risk band classification
 *   - Single-parameter 3-point alert logic
 *   - Partial observability accounting
 *   - Claims-discipline assertions (no diagnostic language in output)
 *
 * No database connection required — computeNews2Score is a pure function.
 *
 * Run with: pnpm --filter @optitriage/api test
 */

import { describe, it, expect } from 'vitest';
import {
  computeNews2Score,
  classifyEwsRiskBand,
  type News2Params,
} from './news2';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal valid params — normal values scoring 0 on all parameters. */
const baseline: News2Params = {
  respiratoryRate: 15, // 12-20 → 0
  heartRate: 70,       // 51-90  → 0
  spo2: 98,            // ≥96    → 0
  systolicBp: 120,     // 111-219 → 0
  temperatureCelsius: 37.0, // 36.1-38.0 → 0
  consciousness: 'alert',   // → 0
  onSupplementalOxygen: false,
};

function score(overrides: Partial<News2Params>) {
  return computeNews2Score({ ...baseline, ...overrides });
}

// ─── Respiratory rate boundary tests ─────────────────────────────────────────

describe('NEWS2 — Respiratory Rate', () => {
  it('scores 3 at RR = 8 (≤8 boundary)', () => {
    expect(score({ respiratoryRate: 8 }).componentScores.respiratoryRate).toBe(3);
  });

  it('scores 3 at RR = 1 (extreme low)', () => {
    expect(score({ respiratoryRate: 1 }).componentScores.respiratoryRate).toBe(3);
  });

  it('scores 1 at RR = 9 (9-11 lower boundary)', () => {
    expect(score({ respiratoryRate: 9 }).componentScores.respiratoryRate).toBe(1);
  });

  it('scores 1 at RR = 11 (9-11 upper boundary)', () => {
    expect(score({ respiratoryRate: 11 }).componentScores.respiratoryRate).toBe(1);
  });

  it('scores 0 at RR = 12 (12-20 lower boundary)', () => {
    expect(score({ respiratoryRate: 12 }).componentScores.respiratoryRate).toBe(0);
  });

  it('scores 0 at RR = 20 (12-20 upper boundary)', () => {
    expect(score({ respiratoryRate: 20 }).componentScores.respiratoryRate).toBe(0);
  });

  it('scores 2 at RR = 21 (21-24 lower boundary)', () => {
    expect(score({ respiratoryRate: 21 }).componentScores.respiratoryRate).toBe(2);
  });

  it('scores 2 at RR = 24 (21-24 upper boundary)', () => {
    expect(score({ respiratoryRate: 24 }).componentScores.respiratoryRate).toBe(2);
  });

  it('scores 3 at RR = 25 (≥25 boundary)', () => {
    expect(score({ respiratoryRate: 25 }).componentScores.respiratoryRate).toBe(3);
  });

  it('scores 3 at RR = 40 (extreme high)', () => {
    expect(score({ respiratoryRate: 40 }).componentScores.respiratoryRate).toBe(3);
  });
});

// ─── Heart rate boundary tests ────────────────────────────────────────────────

describe('NEWS2 — Heart Rate', () => {
  it('scores 3 at HR = 40 (≤40 boundary)', () => {
    expect(score({ heartRate: 40 }).componentScores.heartRate).toBe(3);
  });

  it('scores 3 at HR = 30 (extreme low)', () => {
    expect(score({ heartRate: 30 }).componentScores.heartRate).toBe(3);
  });

  it('scores 1 at HR = 41 (41-50 lower boundary)', () => {
    expect(score({ heartRate: 41 }).componentScores.heartRate).toBe(1);
  });

  it('scores 1 at HR = 50 (41-50 upper boundary)', () => {
    expect(score({ heartRate: 50 }).componentScores.heartRate).toBe(1);
  });

  it('scores 0 at HR = 51 (51-90 lower boundary)', () => {
    expect(score({ heartRate: 51 }).componentScores.heartRate).toBe(0);
  });

  it('scores 0 at HR = 90 (51-90 upper boundary)', () => {
    expect(score({ heartRate: 90 }).componentScores.heartRate).toBe(0);
  });

  it('scores 1 at HR = 91 (91-110 lower boundary)', () => {
    expect(score({ heartRate: 91 }).componentScores.heartRate).toBe(1);
  });

  it('scores 1 at HR = 110 (91-110 upper boundary)', () => {
    expect(score({ heartRate: 110 }).componentScores.heartRate).toBe(1);
  });

  it('scores 2 at HR = 111 (111-130 lower boundary)', () => {
    expect(score({ heartRate: 111 }).componentScores.heartRate).toBe(2);
  });

  it('scores 2 at HR = 130 (111-130 upper boundary)', () => {
    expect(score({ heartRate: 130 }).componentScores.heartRate).toBe(2);
  });

  it('scores 3 at HR = 131 (≥131 boundary)', () => {
    expect(score({ heartRate: 131 }).componentScores.heartRate).toBe(3);
  });

  it('scores 3 at HR = 200 (extreme high)', () => {
    expect(score({ heartRate: 200 }).componentScores.heartRate).toBe(3);
  });
});

// ─── SpO2 boundary tests ──────────────────────────────────────────────────────

describe('NEWS2 — SpO2 (Scale 1)', () => {
  it('scores 3 at SpO2 = 91 (≤91 boundary)', () => {
    expect(score({ spo2: 91 }).componentScores.spo2).toBe(3);
  });

  it('scores 3 at SpO2 = 80 (extreme low)', () => {
    expect(score({ spo2: 80 }).componentScores.spo2).toBe(3);
  });

  it('scores 2 at SpO2 = 92 (92-93 lower boundary)', () => {
    expect(score({ spo2: 92 }).componentScores.spo2).toBe(2);
  });

  it('scores 2 at SpO2 = 93 (92-93 upper boundary)', () => {
    expect(score({ spo2: 93 }).componentScores.spo2).toBe(2);
  });

  it('scores 1 at SpO2 = 94 (94-95 lower boundary)', () => {
    expect(score({ spo2: 94 }).componentScores.spo2).toBe(1);
  });

  it('scores 1 at SpO2 = 95 (94-95 upper boundary)', () => {
    expect(score({ spo2: 95 }).componentScores.spo2).toBe(1);
  });

  it('scores 0 at SpO2 = 96 (≥96 boundary)', () => {
    expect(score({ spo2: 96 }).componentScores.spo2).toBe(0);
  });

  it('scores 0 at SpO2 = 100 (normal)', () => {
    expect(score({ spo2: 100 }).componentScores.spo2).toBe(0);
  });
});

// ─── Systolic BP boundary tests ───────────────────────────────────────────────

describe('NEWS2 — Systolic Blood Pressure', () => {
  it('scores 3 at SBP = 90 (≤90 boundary)', () => {
    expect(score({ systolicBp: 90 }).componentScores.systolicBp).toBe(3);
  });

  it('scores 3 at SBP = 70 (extreme low)', () => {
    expect(score({ systolicBp: 70 }).componentScores.systolicBp).toBe(3);
  });

  it('scores 2 at SBP = 91 (91-100 lower boundary)', () => {
    expect(score({ systolicBp: 91 }).componentScores.systolicBp).toBe(2);
  });

  it('scores 2 at SBP = 100 (91-100 upper boundary)', () => {
    expect(score({ systolicBp: 100 }).componentScores.systolicBp).toBe(2);
  });

  it('scores 1 at SBP = 101 (101-110 lower boundary)', () => {
    expect(score({ systolicBp: 101 }).componentScores.systolicBp).toBe(1);
  });

  it('scores 1 at SBP = 110 (101-110 upper boundary)', () => {
    expect(score({ systolicBp: 110 }).componentScores.systolicBp).toBe(1);
  });

  it('scores 0 at SBP = 111 (111-219 lower boundary)', () => {
    expect(score({ systolicBp: 111 }).componentScores.systolicBp).toBe(0);
  });

  it('scores 0 at SBP = 219 (111-219 upper boundary)', () => {
    expect(score({ systolicBp: 219 }).componentScores.systolicBp).toBe(0);
  });

  it('scores 3 at SBP = 220 (≥220 boundary)', () => {
    expect(score({ systolicBp: 220 }).componentScores.systolicBp).toBe(3);
  });
});

// ─── Temperature boundary tests ───────────────────────────────────────────────

describe('NEWS2 — Temperature', () => {
  it('scores 3 at 35.0°C (≤35.0 boundary)', () => {
    expect(score({ temperatureCelsius: 35.0 }).componentScores.temperature).toBe(3);
  });

  it('scores 1 at 35.1°C (35.1-36.0 lower boundary)', () => {
    expect(score({ temperatureCelsius: 35.1 }).componentScores.temperature).toBe(1);
  });

  it('scores 1 at 36.0°C (35.1-36.0 upper boundary)', () => {
    expect(score({ temperatureCelsius: 36.0 }).componentScores.temperature).toBe(1);
  });

  it('scores 0 at 36.1°C (36.1-38.0 lower boundary)', () => {
    expect(score({ temperatureCelsius: 36.1 }).componentScores.temperature).toBe(0);
  });

  it('scores 0 at 38.0°C (36.1-38.0 upper boundary)', () => {
    expect(score({ temperatureCelsius: 38.0 }).componentScores.temperature).toBe(0);
  });

  it('scores 1 at 38.1°C (38.1-39.0 lower boundary)', () => {
    expect(score({ temperatureCelsius: 38.1 }).componentScores.temperature).toBe(1);
  });

  it('scores 1 at 39.0°C (38.1-39.0 upper boundary)', () => {
    expect(score({ temperatureCelsius: 39.0 }).componentScores.temperature).toBe(1);
  });

  it('scores 2 at 39.1°C (≥39.1 boundary)', () => {
    expect(score({ temperatureCelsius: 39.1 }).componentScores.temperature).toBe(2);
  });

  it('scores 2 at 40.5°C (extreme high)', () => {
    expect(score({ temperatureCelsius: 40.5 }).componentScores.temperature).toBe(2);
  });
});

// ─── Composite score → risk band classification ───────────────────────────────

describe('NEWS2 — Risk band classification', () => {
  it('green at totalScore = 0', () => {
    expect(classifyEwsRiskBand(0)).toBe('green');
  });

  it('green at totalScore = 4 (upper green boundary)', () => {
    expect(classifyEwsRiskBand(4)).toBe('green');
  });

  it('yellow at totalScore = 5 (lower yellow boundary)', () => {
    expect(classifyEwsRiskBand(5)).toBe('yellow');
  });

  it('yellow at totalScore = 6 (upper yellow boundary)', () => {
    expect(classifyEwsRiskBand(6)).toBe('yellow');
  });

  it('red at totalScore = 7 (lower red boundary)', () => {
    expect(classifyEwsRiskBand(7)).toBe('red');
  });

  it('red at totalScore = 20 (maximum possible)', () => {
    expect(classifyEwsRiskBand(20)).toBe('red');
  });

  it('full pipeline: all-normal vitals → totalScore 0 → green', () => {
    const result = score({});
    expect(result.totalScore).toBe(0);
    expect(result.riskBand).toBe('green');
  });

  it('full pipeline: critically elevated RR + HR → red band', () => {
    // RR=30 (score 3) + HR=140 (score 3) + rest normal = 6 → yellow
    // Plus low SpO2=91 (score 3) = 9 → red
    const result = score({
      respiratoryRate: 30,  // 3
      heartRate: 140,       // 3
      spo2: 91,             // 3
    });
    expect(result.totalScore).toBe(9);
    expect(result.riskBand).toBe('red');
  });

  it('supplemental oxygen adds 2 points', () => {
    const withoutO2 = score({ onSupplementalOxygen: false });
    const withO2 = score({ onSupplementalOxygen: true });
    expect(withO2.totalScore - withoutO2.totalScore).toBe(2);
    expect(withO2.componentScores.supplementalOxygen).toBe(2);
  });

  it('consciousness CVPU adds 3 points and triggers singleParameterAlert', () => {
    const result = score({ consciousness: 'cvpu' });
    expect(result.componentScores.consciousness).toBe(3);
    expect(result.singleParameterAlert).toBe(true);
  });
});

// ─── Single-parameter alert tests ────────────────────────────────────────────

describe('NEWS2 — Single-parameter alert (any param = 3)', () => {
  it('no alert when all params score 0', () => {
    expect(score({}).singleParameterAlert).toBe(false);
  });

  it('alert triggered by RR ≤ 8', () => {
    expect(score({ respiratoryRate: 8 }).singleParameterAlert).toBe(true);
  });

  it('alert triggered by RR ≥ 25', () => {
    expect(score({ respiratoryRate: 25 }).singleParameterAlert).toBe(true);
  });

  it('alert triggered by HR ≤ 40', () => {
    expect(score({ heartRate: 40 }).singleParameterAlert).toBe(true);
  });

  it('alert triggered by HR ≥ 131', () => {
    expect(score({ heartRate: 131 }).singleParameterAlert).toBe(true);
  });

  it('alert triggered by SpO2 ≤ 91', () => {
    expect(score({ spo2: 91 }).singleParameterAlert).toBe(true);
  });

  it('alert triggered by SBP ≤ 90', () => {
    expect(score({ systolicBp: 90 }).singleParameterAlert).toBe(true);
  });

  it('alert triggered by SBP ≥ 220', () => {
    expect(score({ systolicBp: 220 }).singleParameterAlert).toBe(true);
  });

  it('alert triggered by temp ≤ 35.0', () => {
    expect(score({ temperatureCelsius: 35.0 }).singleParameterAlert).toBe(true);
  });

  it('no alert when total score is 6 but no single param = 3', () => {
    // RR=21 (score 2) + HR=111 (score 2) + SpO2=94 (score 1) + SBP=101 (score 1) = 6
    const result = score({
      respiratoryRate: 21, // 2
      heartRate: 111,      // 2
      spo2: 94,            // 1
      systolicBp: 101,     // 1
    });
    expect(result.totalScore).toBe(6);
    expect(result.riskBand).toBe('yellow');
    expect(result.singleParameterAlert).toBe(false);
  });
});

// ─── Partial observability tests ──────────────────────────────────────────────

describe('NEWS2 — Partial observability', () => {
  it('counts unobserved params when spo2 absent', () => {
    const result = computeNews2Score({
      respiratoryRate: 15,
      heartRate: 70,
      // spo2 absent
    });
    expect(result.unobservedParameterCount).toBeGreaterThan(0);
  });

  it('unobservedParameterCount = 0 when all params provided', () => {
    expect(score({}).unobservedParameterCount).toBe(0);
  });

  it('unobservedParameterCount = 3 when only RR and HR provided', () => {
    const result = computeNews2Score({
      respiratoryRate: 15,
      heartRate: 70,
    });
    expect(result.unobservedParameterCount).toBe(3); // spo2, sbp, temp
  });
});

// ─── Claims discipline assertions ─────────────────────────────────────────────

describe('NEWS2 — Claims discipline (optitriage.md compliance)', () => {
  it('riskBand uses screening language (green/yellow/red), not diagnostic terms', () => {
    const allowedBands = ['green', 'yellow', 'red'];
    const result = score({});
    expect(allowedBands).toContain(result.riskBand);
  });

  it('result object has no diagnostic field names', () => {
    const result = score({ respiratoryRate: 30, heartRate: 140 });
    const keys = JSON.stringify(result);
    // These field names would imply a diagnosis — forbidden by optitriage.md
    expect(keys).not.toContain('sepsis');
    expect(keys).not.toContain('stroke');
    expect(keys).not.toContain('diagnosis');
    expect(keys).not.toContain('prediction');
    expect(keys).not.toContain('alert_type');
  });
});

/**
 * src/types/queue.ts
 *
 * Shared types for the live triage queue.
 * Used by Dashboard, PatientQueue, VitalsPanel, and EscalationAlert.
 * Shape mirrors the TriageQueueItem returned by GET /api/queue.
 */

/** Numeric-only vital-sign snapshot embedded in a queue item. */
export interface ScanMetrics {
  bpm: number;
  hrv: number;
  respiratoryRate: number;
  motionAsymmetryFlag: boolean;
  ewsScore: number;
  totalCycles?: number;
  discardedCycles?: number;
}

/** One entry in the live triage queue — scanning in-progress or scan-complete. */
export interface QueueItem {
  sessionId: string;
  doctorId: string;
  patientName: string | null;
  patientAge: number | null;
  sessionStatus: 'WAITING' | 'SCANNING' | 'COMPLETED' | 'EXPIRED';
  createdAt: number;
  latestScanId: string | null;
  /** Unix milliseconds of the latest scan capture. */
  capturedAt: number | null;
  ewsScore: number | null;
  ewsRiskBand: 'green' | 'yellow' | 'red' | null;
  motionAsymmetryFlag: boolean | null;
  news2TotalScore: number | null;
  news2SingleParamAlert: boolean | null;
  news2UnobservedCount: number | null;
  metrics: ScanMetrics | null;
  /** True while a patient scan is actively in progress (no metrics yet). */
  isScanning: boolean;
}

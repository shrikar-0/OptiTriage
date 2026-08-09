/**
 * src/db/scanRepository.ts
 *
 * Prisma repository for PatientScan records.
 *
 * ⚠️  DATA CONSTRAINT: The `metrics` JSONB column only ever contains the
 *     numeric fields from TriagePayload. Raw rPPG waveform samples and video
 *     frames are NEVER stored — this constraint is enforced by the caller
 *     (Zod validation + guardNumericPayload in the vitals pipeline) and
 *     documented in schema.prisma.
 *
 * Every method gracefully returns null/empty if the Prisma client is
 * unavailable, allowing the server to run without a database in local dev.
 */

import { getPrismaClient } from './prismaClient';
import type { News2Result } from '../lib/news2';
import type { TriagePayload } from '@optitriage/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape stored in the JSONB `metrics` column. Numeric primitives only. */
export interface ScanMetrics {
  bpm: number;
  hrv: number;
  respiratoryRate: number;
  ewsScore: number;
  motionAsymmetryFlag: boolean;
  timestamp: number;
}

/** Item returned by the triage queue query — one row per active session. */
export interface TriageQueueItem {
  sessionId: string;
  patientName: string | null;
  patientAge: number | null;
  doctorId: string;
  sessionStatus: string;
  createdAt: Date;
  latestScanId: string | null;
  capturedAt: Date | null;
  ewsScore: number | null;
  ewsRiskBand: 'green' | 'yellow' | 'red' | null;
  motionAsymmetryFlag: boolean | null;
  news2TotalScore: number | null;
  news2SingleParamAlert: boolean | null;
  news2UnobservedCount: number | null;
  metrics: ScanMetrics | null;
}

// ─── persist ─────────────────────────────────────────────────────────────────

/**
 * Persists a single vital-sign snapshot to the database.
 *
 * @param sessionId  UUID of the parent DoctorSession.
 * @param vitals     Validated TriagePayload (numeric only — enforced upstream).
 * @param news2      Computed NEWS2 result for this snapshot.
 * @returns          The created PatientScan record, or null if DB unavailable.
 */
export async function persistScan(
  sessionId: string,
  vitals: TriagePayload,
  news2: News2Result,
): Promise<{ id: string } | null> {
  const db = getPrismaClient();
  if (!db) return null;

  const metrics: ScanMetrics = {
    bpm: vitals.bpm,
    hrv: vitals.hrv,
    respiratoryRate: vitals.respiratoryRate,
    ewsScore: vitals.ewsScore,
    motionAsymmetryFlag: vitals.motionAsymmetryFlag,
    timestamp: vitals.timestamp,
  };

  // Map news2 colour band to Prisma enum
  const riskBandMap = { green: 'green', yellow: 'yellow', red: 'red' } as const;

  try {
    const scan = await db.patientScan.create({
      data: {
        sessionId,
        ewsScore: news2.totalScore,
        ewsRiskBand: riskBandMap[news2.riskBand],
        // Cast through unknown: Prisma's Json type doesn't accept typed objects directly
        metrics: metrics as unknown as import('@prisma/client').Prisma.InputJsonValue,
        motionAsymmetryFlag: vitals.motionAsymmetryFlag,
      },
      select: { id: true },
    });
    return scan;
  } catch (err) {
    console.error('[scanRepository] persistScan failed:', (err as Error).message);
    return null;
  }
}

// ─── fetchTriageQueue ─────────────────────────────────────────────────────────

/**
 * Returns the live triage queue for a doctor, sorted by risk severity then
 * recency.
 *
 * Query strategy:
 *   1. Find all non-expired DoctorSessions for the given doctorId.
 *   2. For each session, take the most recent PatientScan.
 *   3. Sort: red → yellow → green, then capturedAt DESC within each band.
 *
 * Returns an empty array if DB is unavailable.
 *
 * @param doctorId  Opaque doctor UUID from JWT claim.
 * @param limit     Maximum number of queue items to return (default 50).
 */
export async function fetchTriageQueue(
  doctorId: string,
  limit = 50,
): Promise<TriageQueueItem[]> {
  const db = getPrismaClient();
  if (!db) return [];

  try {
    // Fetch sessions with their most recent scan using a Prisma nested query.
    // The ewsScore/ewsRiskBand denormalisation on PatientScan makes this fast
    // without a complex subquery or lateral join.
    const sessions = await db.doctorSession.findMany({
      where: {
        doctorId,
        status: { not: 'EXPIRED' },
        expiresAt: { gt: new Date() },
      },
      include: {
        scans: {
          orderBy: { capturedAt: 'desc' },
          take: 1,
        },
      },
      take: limit,
    });

    // Build queue items from all sessions
    const items: TriageQueueItem[] = sessions
      .map((s) => {
        const scan = s.scans[0];
        const m = scan ? scan.metrics as unknown as ScanMetrics : null;
        return {
          sessionId: s.id,
          patientName: s.patientName,
          patientAge: s.patientAge,
          doctorId: s.doctorId,
          sessionStatus: s.status,
          createdAt: s.createdAt,
          latestScanId: scan ? scan.id : null,
          capturedAt: scan ? scan.capturedAt : null,
          ewsScore: scan ? scan.ewsScore : null,
          ewsRiskBand: scan ? scan.ewsRiskBand as 'green' | 'yellow' | 'red' : null,
          motionAsymmetryFlag: scan ? scan.motionAsymmetryFlag : null,
          news2TotalScore: scan ? scan.ewsScore : null,
          news2SingleParamAlert: scan ? scan.motionAsymmetryFlag : null, // proxy for now
          news2UnobservedCount: scan ? 0 : null,
          metrics: m,
        };
      });

    // Sort: red first, then yellow, then green; within band by capturedAt DESC
    const bandOrder: Record<string, number> = { red: 0, yellow: 1, green: 2 };
    items.sort((a, b) => {
      // WAITING/SCANNING at top
      if (a.sessionStatus === 'SCANNING' && b.sessionStatus !== 'SCANNING') return -1;
      if (a.sessionStatus !== 'SCANNING' && b.sessionStatus === 'SCANNING') return 1;
      if (a.sessionStatus === 'WAITING' && b.sessionStatus !== 'WAITING') return -1;
      if (a.sessionStatus !== 'WAITING' && b.sessionStatus === 'WAITING') return 1;
      
      const bandDiff = (a.ewsRiskBand ? bandOrder[a.ewsRiskBand] ?? 3 : 3) - (b.ewsRiskBand ? bandOrder[b.ewsRiskBand] ?? 3 : 3);
      if (bandDiff !== 0) return bandDiff;
      const tA = a.capturedAt ? a.capturedAt.getTime() : 0;
      const tB = b.capturedAt ? b.capturedAt.getTime() : 0;
      return tB - tA;
    });

    return items;
  } catch (err) {
    console.error('[scanRepository] fetchTriageQueue failed:', (err as Error).message);
    return [];
  }
}

/**
 * src/store/sessionStore.ts
 *
 * In-memory session registry.
 *
 * This is a Phase 1 placeholder. In a later phase this will be replaced with
 * Prisma + PostgreSQL persistence. The store interface is designed so that swap
 * requires only replacing this module — callers need no changes.
 *
 * Expired sessions are evicted lazily on access and proactively by a periodic
 * sweep every SESSION_SWEEP_INTERVAL_MS milliseconds.
 *
 * ⚠️  PRIVACY: This store holds sessionId, doctorId, and expiresAt.
 *     patientPhone is stored transiently for the WhatsApp results delivery
 *     that fires immediately after scan completion. It is never written to
 *     disk, never logged, and is evicted with the session on expiry.
 */

export interface SessionRecord {
  sessionId: string;
  doctorId: string;
  expiresAt: number; // Unix ms
  patientConnected: boolean;
  doctorConnected: boolean;
  vitalsReceived: boolean;
  createdAt: number;
  /** Patient display name — stored for broadcast payload enrichment. */
  patientName?: string;
  /** Patient age — stored for broadcast payload enrichment. */
  patientAge?: number;
  /**
   * Patient phone — held transiently for the post-scan WhatsApp delivery.
   * Never persisted to disk. Evicted when the session expires.
   */
  patientPhone?: string;
  /** BCP-47 language code for the Gemini AI WhatsApp summary. */
  preferredLanguage: string;
}

const SESSION_SWEEP_INTERVAL_MS = 60_000; // 1 minute

class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor() {
    // Periodic sweep to evict stale sessions and free memory
    setInterval(() => this.sweep(), SESSION_SWEEP_INTERVAL_MS).unref();
  }

  create(params: { sessionId: string; doctorId: string; expiresAt: number; patientPhone?: string; patientName?: string; patientAge?: number; preferredLanguage?: string }): SessionRecord {
    const record: SessionRecord = {
      ...params,
      preferredLanguage: params.preferredLanguage ?? 'en',
      patientConnected: false,
      doctorConnected: false,
      vitalsReceived: false,
      createdAt: Date.now(),
    };
    this.sessions.set(params.sessionId, record);
    return record;
  }

  get(sessionId: string): SessionRecord | undefined {
    const record = this.sessions.get(sessionId);
    if (!record) return undefined;

    // Lazy eviction on access
    if (Date.now() > record.expiresAt) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    return record;
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  markPatientConnected(sessionId: string, connected: boolean): void {
    const record = this.sessions.get(sessionId);
    if (record) record.patientConnected = connected;
  }

  markDoctorConnected(sessionId: string, connected: boolean): void {
    const record = this.sessions.get(sessionId);
    if (record) record.doctorConnected = connected;
  }

  markVitalsReceived(sessionId: string): void {
    const record = this.sessions.get(sessionId);
    if (record) record.vitalsReceived = true;
  }

  /** Remove all sessions whose expiry has passed. */
  private sweep(): void {
    const now = Date.now();
    for (const [id, record] of this.sessions.entries()) {
      if (now > record.expiresAt) {
        this.sessions.delete(id);
      }
    }
  }
}

/** Singleton session store — one instance for the process lifetime. */
export const sessionStore = new SessionStore();

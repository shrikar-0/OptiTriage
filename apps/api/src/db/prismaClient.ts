/**
 * src/db/prismaClient.ts
 *
 * Singleton Prisma client using the @prisma/adapter-pg driver adapter.
 *
 * Prisma v7 removed the built-in query engine and requires an explicit driver
 * adapter.  We use PrismaPg (the official pg-compatible adapter) pointed at
 * DATABASE_URL (port 6543 — Supabase transaction-mode pooler).
 *
 * DATABASE_URL  → port 6543 (PgBouncer pooler) — used by the API at runtime.
 * DIRECT_URL    → port 5432 (session-mode)      — used by Prisma CLI (prisma.config.ts).
 *
 * Never swap these: the pooler (6543) can reach DNS on this network;
 * the direct connection (5432) was DNS-blocked.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

let _client: PrismaClient | null = null;
let _initialised = false;

/**
 * Returns the singleton Prisma client, or null if DATABASE_URL is not set.
 * Safe to call repeatedly — instantiation happens exactly once.
 */
export function getPrismaClient(): PrismaClient | null {
  if (_initialised) return _client;
  _initialised = true;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes('user:password@localhost')) {
    console.warn(
      '[DB] DATABASE_URL not configured or still set to placeholder value. ' +
        'Running with in-memory store only. Set DATABASE_URL in .env to enable persistence.',
    );
    _client = null;
    return null;
  }

  try {
    // PrismaPg accepts the connection string directly — uses the pg Pool under the hood.
    const adapter = new PrismaPg({ connectionString: dbUrl });
    _client = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
    console.log('[DB] Prisma client initialised with PrismaPg adapter (DATABASE_URL).');
  } catch (err) {
    console.error('[DB] Prisma client failed to initialise:', (err as Error).message);
    _client = null;
  }

  return _client;
}

/**
 * Runs $connect() to verify the database is reachable.
 * Call once on startup; logs success/failure without throwing.
 */
export async function checkDbConnection(): Promise<boolean> {
  const db = getPrismaClient();
  if (!db) {
    console.warn('[DB] Health check skipped — no Prisma client (DATABASE_URL not set).');
    return false;
  }

  try {
    await db.$connect();
    console.log('[DB] ✓ Database connection verified successfully.');
    return true;
  } catch (err) {
    console.error(
      '[DB] ✗ Database connection FAILED:',
      (err as Error).message,
      '\n  → Check that DATABASE_URL points to port 6543 (pooler), not 5432 (direct).',
    );
    return false;
  }
}

/**
 * Gracefully disconnect the Prisma client on process exit.
 */
export async function disconnectPrisma(): Promise<void> {
  if (_client) {
    await _client.$disconnect();
    _client = null;
    _initialised = false;
  }
}

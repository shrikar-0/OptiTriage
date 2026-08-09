/**
 * src/config.ts
 *
 * Single source-of-truth for environment variable reads.
 * Throws at startup if a required variable is missing — fail-fast, never
 * silently use a default that could compromise security.
 *
 * To swap in real credentials: update .env only — no code changes required.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `[config] Required environment variable "${name}" is missing. ` +
        `Copy .env.example to .env and populate all required fields.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value !== undefined && value !== '' ? value : fallback;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    throw new Error(`[config] Environment variable "${name}" must be an integer, got: "${raw}"`);
  }
  return parsed;
}

// ─── Exported config object ────────────────────────────────────────────────

export const config = {
  port: optionalInt('PORT', 3001),

  cors: {
    // Comma-separated list of allowed origins.
    origins: optional('CORS_ORIGIN', 'http://localhost:5173').split(',').map((o) => o.trim()),
  },

  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expirySeconds: optionalInt('JWT_SESSION_EXPIRY_SECONDS', 1800),
  },


  scan: {
    baseUrl: optional('PATIENT_SCAN_BASE_URL', 'http://localhost:5173/scan'),
  },

  rateLimits: {
    session: {
      max: optionalInt('RATE_LIMIT_SESSION_MAX', 10),
      windowMs: optionalInt('RATE_LIMIT_SESSION_WINDOW_MS', 900_000),
    },
    general: {
      max: optionalInt('RATE_LIMIT_GENERAL_MAX', 100),
      windowMs: optionalInt('RATE_LIMIT_GENERAL_WINDOW_MS', 60_000),
    },
  },
} as const;

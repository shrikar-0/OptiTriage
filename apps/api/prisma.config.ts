/**
 * prisma.config.ts
 *
 * Prisma v7 configuration file.
 *
 * In Prisma v7, `directUrl` is removed. The single `datasource.url` here
 * is used by ALL Prisma CLI commands (db push, generate, etc.).
 *
 * For Supabase with PgBouncer:
 *  - Port 6543 = Transaction-mode pooler (used by PrismaClient at runtime).
 *    Multi-step DDL introspection hangs here — do NOT use for CLI.
 *  - Port 5432 = Session-mode / direct connection (used by Prisma CLI).
 *    Supports full DDL without hanging.
 *
 * So this file points to DIRECT_URL (port 5432).
 * PrismaClient in application code must override with DATABASE_URL (port 6543)
 * at instantiation time via: new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } })
 *
 * Reference: https://pris.ly/d/config-datasource
 */

import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  datasource: {
    url: env('DIRECT_URL'),
  },
});

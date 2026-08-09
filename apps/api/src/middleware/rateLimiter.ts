/**
 * src/middleware/rateLimiter.ts
 *
 * Rate-limiting middleware using express-rate-limit.
 * All thresholds are configurable via env vars — no magic numbers in code.
 *
 * Two limiters are exported:
 *   sessionCreateLimiter — tight limit on the session-creation endpoint
 *                          (prevents SMS spam / session flooding)
 *   generalLimiter       — broader limit applied globally to all routes
 */

import rateLimit from 'express-rate-limit';
import { config } from '../config';

/**
 * Tight limiter for the session-creation endpoint.
 * Default: 10 requests per 15 minutes per IP.
 * Configurable via RATE_LIMIT_SESSION_MAX + RATE_LIMIT_SESSION_WINDOW_MS.
 */
export const sessionCreateLimiter = rateLimit({
  windowMs: config.rateLimits.session.windowMs,
  max: config.rateLimits.session.max,
  standardHeaders: 'draft-7', // Return rate-limit headers (RateLimit-*)
  legacyHeaders: false,
  message: {
    error: 'Too many session requests from this IP. Please wait before trying again.',
  },
  skipSuccessfulRequests: false,
});

/**
 * General limiter applied to all routes.
 * Default: 100 requests per minute per IP.
 * Configurable via RATE_LIMIT_GENERAL_MAX + RATE_LIMIT_GENERAL_WINDOW_MS.
 */
export const generalLimiter = rateLimit({
  windowMs: config.rateLimits.general.windowMs,
  max: config.rateLimits.general.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please slow down.',
  },
});

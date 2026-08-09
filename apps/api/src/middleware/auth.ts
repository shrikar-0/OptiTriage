/**
 * src/middleware/auth.ts
 *
 * requireJwt — Express middleware that validates the Bearer token present
 * in the Authorization header and attaches the decoded payload to res.locals.
 *
 * Usage:
 *   router.post('/protected', requireJwt, handler)
 *
 * On success: sets res.locals.jwtPayload (VerifiedSessionToken) and calls next().
 * On failure: responds 401 with a JSON error — never leaks the raw JWT error message
 *             to avoid token oracle attacks.
 */

import type { Request, Response, NextFunction } from 'express';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { verifySessionToken, type VerifiedSessionToken } from '../lib/jwtUtils';

/** Shape added to res.locals by requireJwt. */
declare global {
  namespace Express {
    interface Locals {
      jwtPayload: VerifiedSessionToken;
    }
  }
}

export function requireJwt(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header.' });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const payload = verifySessionToken(token);
    res.locals.jwtPayload = payload;
    next();
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      res.status(401).json({ error: 'Session token has expired. Request a new scan link.' });
      return;
    }
    if (err instanceof JsonWebTokenError) {
      // Generic message — don't reveal why verification failed (oracle protection).
      res.status(401).json({ error: 'Invalid session token.' });
      return;
    }
    // Unexpected error — propagate to global error handler.
    next(err);
  }
}

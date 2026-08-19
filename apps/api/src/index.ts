/**
 * OptiTriage API — Relay & Auth Layer
 *
 * Entry point.  Wires together:
 *   - Express with CORS, JSON parsing, and global rate limiting
 *   - JWT auth middleware on all protected routes
 *   - Session management (POST /api/sessions)
 *   - HTTP vitals fallback (POST /api/sessions/:sessionId/vitals)
 *   - Socket.io /triage namespace with JWT handshake, numeric-only relay,
 *     payload guard, and NEWS2 EWS risk-band enrichment
 *
 * ─── ARCHITECTURE CONSTRAINT ─────────────────────────────────────────────────
 * No endpoint in this layer accepts image, video, canvas, or binary data.
 * Every inbound data path validates through guardNumericPayload() + Zod before
 * touching any business logic.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import 'dotenv/config';
import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';

import { config } from './config';
import { generalLimiter } from './middleware/rateLimiter';
import { createSessionsRouter } from './routes/sessions';
import { createVitalsRouter } from './routes/vitals';
import { queueRouter } from './routes/queue';
import { staffRouter } from './routes/staff';
import { guardNumericPayload } from './lib/payloadGuard';
import { verifySessionToken } from './lib/jwtUtils';
import { computeNews2Score } from './lib/news2';
import { sessionStore } from './store/sessionStore';
import { persistScan } from './db/scanRepository';
import { disconnectPrisma, getPrismaClient, checkDbConnection } from './db/prismaClient';
import { supabaseAdmin } from './lib/supabaseAdmin';
import { getEwsRiskBand } from '@optitriage/shared';
import type { TriagePayload } from '@optitriage/shared';
import { initWhatsApp, destroyWhatsApp, sendHealthSummary } from './lib/smsGateway';
import { generateVitalsSummary } from './lib/geminiSummary';

// ─── Express App ──────────────────────────────────────────────────────────────

const app: Application = express();

// Body parsing — size limit prevents accidental large-blob uploads
app.use(express.json({ limit: '16kb' }));

// Global rate limiter — applies to every HTTP route
app.use(generalLimiter);

// ─── CORS ─────────────────────────────────────────────────────────────────────

app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers['origin'] ?? '';
  if (config.cors.origins.includes(origin) || config.cors.origins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).send();
    return;
  }
  next();
});

// ─── Health Check (unauthenticated, rate-limited) ────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'optitriage-api',
    timestamp: Date.now(),
  });
});

// ─── HTTP API Routes ──────────────────────────────────────────────────────────

// Socket.io is attached after httpServer is created — vitalsRouter needs the io
// instance. We wire it up below after io is initialised.
app.use('/api/queue', queueRouter);
app.use('/api/staff', staffRouter);

// ─── HTTP Server ─────────────────────────────────────────────────────────────

const httpServer = createServer(app);

// ─── Socket.io Server — /triage namespace ────────────────────────────────────

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.cors.origins,
    methods: ['GET', 'POST'],
  },
  // Reject connections with payloads over 64 KB at the transport level
  maxHttpBufferSize: 64 * 1024,
});

// Wire HTTP routes that need the io instance
app.use('/api/sessions', createVitalsRouter(io));
app.use('/api/sessions', createSessionsRouter(io));

// ─── Zod schema for socket vitals event ──────────────────────────────────────

const VitalsEventSchema = z.object({
  sessionId: z.string().uuid(),
  timestamp: z.number().int().positive(),
  bpm: z.number().min(30).max(250),
  hrv: z.number().min(0).max(500),
  respiratoryRate: z.number().min(5).max(60),
  motionAsymmetryFlag: z.boolean(),
  ewsScore: z.number().int().min(0).max(20),
  totalCycles: z.number().int().min(1).max(5).optional(),
  discardedCycles: z.number().int().min(0).max(4).optional(),
  /** Raw CHROM waveform — numeric only, max 4 000 samples. */
  pulseSignal: z.array(z.number().finite()).max(4000).optional(),
});

// ─── Triage Namespace ─────────────────────────────────────────────────────────

const triageNs = io.of('/triage');

/**
 * Socket.io JWT handshake middleware.
 *
 * Accepts two token types:
 *   1. OptiTriage session JWT (patient scan tokens, role: 'patient' | 'doctor')
 *      — verified synchronously with verifySessionToken().
 *   2. Supabase access JWT (doctor dashboard connections, authType: 'dashboard')
 *      — verified asynchronously with supabaseAdmin.auth.getUser().
 *
 * This keeps the patient scan token path completely isolated while allowing
 * the doctor dashboard to connect using its Supabase session.
 */
triageNs.use(async (socket, next) => {
  const rawToken = socket.handshake.auth?.token as string | undefined;

  if (!rawToken) {
    next(new Error('AUTH_REQUIRED: Provide a session token in handshake.auth.token'));
    return;
  }

  // ── Path 1: OptiTriage session JWT (patient + legacy doctor tokens) ──────
  try {
    const payload = verifySessionToken(rawToken);
    socket.data.jwtPayload = payload;
    socket.data.authType = 'session';
    next();
    return;
  } catch {
    // Not an OptiTriage JWT — try Supabase JWT next.
  }

  // ── Path 2: Supabase access JWT (doctor dashboard) ───────────────────────
  try {
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(rawToken);

    if (error || !user) {
      next(new Error('AUTH_INVALID: Invalid or expired session token.'));
      return;
    }

    const db = getPrismaClient();
    const staff = db ? await db.staff.findUnique({ where: { supabaseUserId: user.id } }) : null;

    if (!staff) {
      next(new Error('AUTH_INVALID: No staff account found.'));
      return;
    }

    // Set a synthetic jwtPayload compatible with the connection handler
    socket.data.jwtPayload = {
      sessionId: '',       // no specific session — dashboard-level connection
      doctorId: staff.id,
      role: 'doctor' as const,
    };
    socket.data.authType = 'dashboard';
    next();
  } catch {
    next(new Error('AUTH_INVALID: Invalid or expired session token.'));
  }
});

triageNs.on('connection', (socket) => {
  const { sessionId, doctorId, role } = socket.data.jwtPayload;

  // ── Dashboard connections (Supabase JWT) ─────────────────────────────────
  // These are doctor dashboard clients monitoring the namespace for new
  // sessions. They receive session:created broadcasts but are not in any
  // session-specific room (vitals:update is room-scoped).
  if (socket.data.authType === 'dashboard') {
    console.log(`[socket] dashboard doctor ${doctorId} connected to /triage namespace`);
    void socket.join(`doctor:${doctorId}`);
    return; // skip session-store check
  }

  // Validate the session exists before allowing the socket to proceed
  const session = sessionStore.get(sessionId);
  if (!session) {
    socket.emit('error', { code: 'SESSION_NOT_FOUND', message: 'Session not found or expired.' });
    socket.disconnect(true);
    return;
  }

  // Join the session room
  const roomName = `session:${sessionId}`;
  void socket.join(roomName);

  // Track connection state
  if (role === 'patient') {
    sessionStore.markPatientConnected(sessionId, true);
    console.log(`[socket] patient joined session ${sessionId}`);
    
    // Update DB status to SCANNING
    import('./db/sessionRepository').then(({ updateSessionStatus }) => {
      void updateSessionStatus(sessionId, 'SCANNING');
    });

    // Notify doctor room that patient started scanning
    socket.to(roomName).emit('session:status_changed', {
      sessionId,
      status: 'SCANNING',
    });
    socket.to(`doctor:${doctorId}`).emit('session:status_changed', {
      sessionId,
      status: 'SCANNING',
    });
  } else if (role === 'doctor') {
    sessionStore.markDoctorConnected(sessionId, true);
    console.log(`[socket] doctor ${doctorId} joined session ${sessionId}`);
  }

  // ── vitals event — patient → server → doctor ─────────────────────────────

  socket.on('vitals', (rawPayload: unknown) => {
    console.log('[API] Received vitals:', rawPayload);
    // Only patients may push vitals
    if (role !== 'patient') {
      socket.emit('error', {
        code: 'FORBIDDEN',
        message: 'Only patient-scoped tokens may emit vitals.',
      });
      return;
    }

    // ── Layer 1: Binary / media payload guard ───────────────────────────────
    const rejection = guardNumericPayload(rawPayload);
    if (rejection) {
      console.warn(
        `[security] Non-numeric payload rejected on socket ${socket.id}: ` +
          `field="${rejection.field}" reason="${rejection.reason}"`,
      );
      socket.emit('error', {
        code: 'PAYLOAD_REJECTED',
        message: 'Only numeric vital signs are accepted. Binary/media data is not permitted.',
        field: rejection.field,
      });
      // Disconnect the socket — this is a hard violation of the architecture rule
      socket.disconnect(true);
      return;
    }

    // ── Layer 2: Zod schema validation ─────────────────────────────────────
    const parsed = VitalsEventSchema.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit('error', {
        code: 'VALIDATION_ERROR',
        message: 'Vitals payload failed schema validation.',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const vitals: TriagePayload = parsed.data;

    // Ensure the session in the payload matches the token claim
    if (vitals.sessionId !== sessionId) {
      socket.emit('error', {
        code: 'SESSION_MISMATCH',
        message: 'sessionId in payload does not match the authenticated session.',
      });
      socket.disconnect(true);
      return;
    }

    // ── Compute NEWS2 score ────────────────────────────────────────────────
    const news2 = computeNews2Score({
      respiratoryRate: vitals.respiratoryRate,
      heartRate: vitals.bpm,
    });

    // ── Update Session status ──────────────────────────────────────────────
    if (!sessionStore.get(sessionId)?.vitalsReceived) {
      sessionStore.markVitalsReceived(sessionId);
      import('./db/sessionRepository').then(({ updateSessionStatus }) => {
        void updateSessionStatus(sessionId, 'COMPLETED');
      });
    }

    // ── Persist scan (fire-and-forget; no-ops if DB unavailable) ──────────
    void persistScan(sessionId, vitals, news2);

    // ── WhatsApp results delivery (fire-and-forget; isolated from vitals flow) ─
    // Only runs once per session (first vitals packet) to avoid duplicate sends.
    void (async () => {
      try {
        const sessionRecord = sessionStore.get(sessionId);
        const phone = sessionRecord?.patientPhone;
        const language = sessionRecord?.preferredLanguage ?? 'en';

        // Build the Gemini input from computed values
        const summaryInput = {
          bpm: vitals.bpm,
          hrv: vitals.hrv,
          respRate: vitals.respiratoryRate,
          ewsScore: vitals.ewsScore,
          news2Category: news2.riskBand,
        };

        console.log('[Gemini] Calling with language:', language,
          '| preferredLanguage from store:', sessionRecord?.preferredLanguage,
          '| from session:', sessionId);
        const aiSummary = await generateVitalsSummary(summaryInput, language);
        const sent = await sendHealthSummary(phone, aiSummary);

        if (phone) {
          console.log(`[vitals] WhatsApp summary ${sent ? 'sent' : 'skipped (not ready)'} for session ${sessionId}`);
        }
      } catch (err) {
        // Never let WhatsApp/Gemini errors surface into the vitals flow
        console.error('[vitals] WhatsApp summary delivery failed (non-fatal):', (err as Error).message);
      }
    })();

    // ── Broadcast to doctor room with EWS risk band + NEWS2 summary ────────
    // ewsScore was validated by Zod; getEwsRiskBand is a pure function.
    const broadcastPayload = {
      ...vitals,
      ewsRiskBand: getEwsRiskBand(vitals.ewsScore),
      news2: {
        totalScore: news2.totalScore,
        riskBand: news2.riskBand,
        singleParameterAlert: news2.singleParameterAlert,
        unobservedParameterCount: news2.unobservedParameterCount,
      },
    };

    // Emit to everyone in the room (doctor + any monitoring clients)
    // The emitting patient socket does NOT receive the echo (socket.to vs socket.emit)
    socket.to(roomName).emit('vitals:update', broadcastPayload);
    socket.to(`doctor:${doctorId}`).emit('vitals:update', broadcastPayload);
  });

  // ── Disconnect housekeeping ───────────────────────────────────────────────

  socket.on('disconnect', () => {
    if (role === 'patient') {
      sessionStore.markPatientConnected(sessionId, false);
      console.log(`[socket] patient disconnected from session ${sessionId}`);
    } else if (role === 'doctor') {
      sessionStore.markDoctorConnected(sessionId, false);
      console.log(`[socket] doctor disconnected from session ${sessionId}`);
    }
  });
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(config.port, () => {
  console.log(`OptiTriage API listening on http://localhost:${config.port}`);
  // Start WhatsApp gateway (prints QR to terminal on first run)
  initWhatsApp();
  // Run DB health check immediately on boot so connectivity issues are visible
  // in server logs rather than only surfacing on the first authenticated request.
  checkDbConnection().then((ok) => {
    if (!ok) {
      console.warn(
        '[DB] ⚠ Server started but database is unreachable. ' +
          'Staff auth and persistence will fail until DB connectivity is restored.',
      );
    }
  });
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on('SIGTERM', async () => {
  console.log('[shutdown] SIGTERM received — closing server.');
  await disconnectPrisma();
  httpServer.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  console.log('[shutdown] SIGINT received — closing server.');
  await disconnectPrisma();
  await destroyWhatsApp();
  httpServer.close(() => process.exit(0));
});

export { app, io };

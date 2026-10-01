/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ClinicRoster Full-Stack Server
 * Express entry point mounting Vite middleware in development
 * and serving static assets with client-side routing fallback in production.
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { serverRepo } from './db/index';
import {
  initializeServerDatabaseIfEmpty,
  isServerDatabaseCleared,
} from './services/seed/serverSeedRunner';
import { adminRouter } from './routes/admin';
import { authMiddleware } from './middleware/auth';
import { authRouter } from './routes/auth';
import { clinicRouter } from './routes/clinic';
import { staffRouter } from './routes/staff';
import { scheduleRouter } from './routes/schedules';
import { rosterRouter } from './routes/roster';
import { shareRouter } from './routes/share';
import { calendarRouter } from './routes/calendar';
import { emailRouter } from './routes/email';
import { crudRouter } from './routes/crud';
import { webhookRouter } from './routes/webhook';
import { availabilityRouter } from './routes/availability';
import { leaveRouter } from './routes/leave';
import { approvalsRouter } from './routes/approvals';
import { acknowledgmentChaser } from './services/jobs/acknowledgmentChaser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isProduction = process.env.NODE_ENV === 'production';

  // Active connections & metrics tracking
  let activeRequestsCount = 0;
  app.use((_req, res, next) => {
    activeRequestsCount++;
    res.on('finish', () => {
      activeRequestsCount = Math.max(0, activeRequestsCount - 1);
    });
    next();
  });

  // Security Headers via Helmet (configured to allow iframe rendering in AI Studio preview)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // Rate Limiting Middlewares
  // 1. Strict limit on public schedule share links (60 requests / minute)
  const shareRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'TooManyRequests',
      message: 'Rate limit exceeded: maximum 60 requests per minute on public share links.',
    },
  });

  // 2. Standard limit on dynamic iCalendar subscription feeds (120 requests / minute)
  const calendarRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'TooManyRequests',
      message: 'Rate limit exceeded: maximum 120 requests per minute on calendar feeds.',
    },
  });

  // Middlewares
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(authMiddleware);

  // Apply Rate Limiters to Targeted Public Endpoints
  app.use('/api/share', shareRateLimiter);
  app.use('/api/roster/calendar', calendarRateLimiter);

  // Verify database state on cold start (no auto-seeding of demo data)
  try {
    const isWiped = await isServerDatabaseCleared(serverRepo);
    if (!isWiped) {
      console.log('[Server] Cold start: Database is running in clean production mode.');
    }
  } catch (err) {
    console.error('[Server] Cold start database check failed:', err);
  }

  // Expanded Health & Observability Endpoint
  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      const mem = process.memoryUsage();
      const storageStats = await serverRepo.getStorageStats();
      const uptimeSec = Math.floor(process.uptime());

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'ClinicRoster API',
        environment: isProduction ? 'production' : 'development',
        system: {
          uptimeSeconds: uptimeSec,
          uptimeFormatted: `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`,
          memory: {
            rssMb: +(mem.rss / 1024 / 1024).toFixed(2),
            heapTotalMb: +(mem.heapTotal / 1024 / 1024).toFixed(2),
            heapUsedMb: +(mem.heapUsed / 1024 / 1024).toFixed(2),
            externalMb: +(mem.external / 1024 / 1024).toFixed(2),
          },
          nodeVersion: process.version,
          platform: process.platform,
          activeRequests: activeRequestsCount,
        },
        database: {
          engine: 'JsonFileRepository',
          directory: storageStats.storageDirectory,
          totalSizeBytes: storageStats.totalSizeBytes,
          totalSizeReadable: storageStats.totalSizeReadable,
          collectionsCount: storageStats.collectionsCount,
          totalDocuments: storageStats.totalDocuments,
          collections: storageStats.collections,
        },
        security: {
          helmet: {
            enabled: true,
            frameguard: 'disabled (iframe-compatible)',
          },
          rateLimiting: {
            shareEndpointLimit: '60 requests / minute',
            calendarFeedLimit: '120 requests / minute',
          },
        },
        jobs: {
          acknowledgmentChaser: acknowledgmentChaser.getStatus(),
        },
      });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // Authentication Routes
  app.use('/api/auth', authRouter);

  // Clinic, Staff, Schedule, Roster, Share, Calendar, Email, Leave & Approvals Routes
  app.use('/api', clinicRouter);
  app.use('/api', staffRouter);
  app.use('/api', scheduleRouter);
  app.use('/api', rosterRouter);
  app.use('/api', shareRouter);
  app.use('/api', calendarRouter);
  app.use('/api', emailRouter);
  app.use('/api', availabilityRouter);
  app.use('/api', leaveRouter);
  app.use('/api', approvalsRouter);
  app.use('/api', crudRouter);
  app.use('/api', webhookRouter);

  // Admin Routes
  app.use('/api/admin', adminRouter);

  // Frontend Integration: Vite middleware in development, static bundle in production
  if (!isProduction) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Look for client dist either at process.cwd()/dist or relative
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `ClinicRoster server listening on http://0.0.0.0:${PORT} [${isProduction ? 'production' : 'development'}]`
    );
    // Start automated background jobs
    acknowledgmentChaser.start();
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting ClinicRoster server:', err);
  process.exit(1);
});

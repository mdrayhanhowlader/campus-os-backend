import 'express-async-errors';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';

import { env } from './config/env';
import { connectDatabase } from './config/database';
import { connectRedis } from './config/redis';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { initSocket, setIo } from './sockets/socket';
import v1Routes from './routes/v1/index';

async function bootstrap() {
  const app = express();

  // ─── Security Middleware ────────────────────────────────────
  app.use(helmet({ contentSecurityPolicy: env.NODE_ENV === 'production' }));
  app.use(hpp());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Global rate limit: 200 req/15 min per IP
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  // ─── General Middleware ─────────────────────────────────────
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());
  app.use(
    morgan('combined', {
      stream: { write: (message) => logger.http(message.trim()) },
      skip: () => env.NODE_ENV === 'test',
    })
  );

  // Trust proxy (for correct IP behind nginx/load balancer)
  app.set('trust proxy', 1);

  // ─── Routes ────────────────────────────────────────────────
  app.use(env.API_PREFIX, v1Routes);

  // ─── Error Handling ─────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  // ─── HTTP + WebSocket Server ────────────────────────────────
  const httpServer = http.createServer(app);
  const io = initSocket(httpServer);
  setIo(io);

  // ─── DB + Cache Connections ─────────────────────────────────
  await connectDatabase();
  await connectRedis();

  httpServer.listen(env.PORT, () => {
    logger.info(`🚀 CampusOS API running on port ${env.PORT} [${env.NODE_ENV}]`);
    logger.info(`📖 Docs: http://localhost:${env.PORT}${env.API_PREFIX}/health`);
  });

  // ─── Graceful Shutdown ──────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    httpServer.close(async () => {
      const { disconnectDatabase } = await import('./config/database');
      const { redis } = await import('./config/redis');
      await disconnectDatabase();
      await redis.quit();
      logger.info('Shutdown complete.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Catch unhandled rejections without crashing
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', reason);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

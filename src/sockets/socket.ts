import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AccessTokenPayload } from '../types';

export function initSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.FRONTEND_URL, credentials: true },
    transports: ['websocket', 'polling'],
  });

  // JWT auth handshake
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.slice(7);
    if (!token) return next(new Error('Authentication required'));

    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
      (socket as any).user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user as AccessTokenPayload;
    logger.debug(`Socket connected: ${user.sub} (${user.role})`);

    // Join school room and user-specific room
    socket.join(`school:${user.schoolId}`);
    socket.join(`user:${user.sub}`);

    // Teachers join their class rooms
    socket.on('join:class', (classId: string) => {
      socket.join(`class:${classId}`);
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${user.sub}`);
    });
  });

  return io;
}

// Emit helpers — import `io` where needed after initialization
let _io: Server;
export function setIo(io: Server) { _io = io; }
export function getIo(): Server { return _io; }

export function emitToUser(userId: string, event: string, data: unknown) {
  _io?.to(`user:${userId}`).emit(event, data);
}

export function emitToClass(classId: string, event: string, data: unknown) {
  _io?.to(`class:${classId}`).emit(event, data);
}

export function emitToSchool(schoolId: string, event: string, data: unknown) {
  _io?.to(`school:${schoolId}`).emit(event, data);
}

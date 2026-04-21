import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { cache } from '../config/redis';
import { AppError } from './errorHandler';
import { AuthenticatedRequest, AccessTokenPayload } from '../types';

export async function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError('Authentication token required', 401);
  }

  const token = authHeader.slice(7);

  // Check token blacklist in Redis (set on logout)
  const isBlacklisted = await cache.exists(`blacklist:${token}`);
  if (isBlacklisted) {
    throw new AppError('Token has been revoked', 401);
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    req.user = {
      id: payload.sub,
      schoolId: payload.schoolId,
      email: payload.email,
      role: payload.role,
      firstName: payload.firstName,
      lastName: payload.lastName,
    };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError('Token has expired', 401);
    }
    throw new AppError('Invalid authentication token', 401);
  }
}

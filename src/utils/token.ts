import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { AccessTokenPayload, RefreshTokenPayload } from '../types';
import { UserRole } from '@prisma/client';

interface TokenUserData {
  id: string;
  schoolId: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
}

export function generateAccessToken(user: TokenUserData): string {
  const payload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
    sub: user.id,
    schoolId: user.schoolId,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  });
}

export function generateRefreshToken(userId: string, jti: string): string {
  const payload: Omit<RefreshTokenPayload, 'iat' | 'exp'> = { sub: userId, jti };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}

/** Generate a cryptographically secure token for password resets / email verification */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Extract expiry in seconds from a JWT expiry string like "7d", "15m" */
export function parseExpiryToSeconds(expiry: string): number {
  const unit = expiry.slice(-1);
  const value = parseInt(expiry.slice(0, -1), 10);
  const map: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (map[unit] ?? 1);
}

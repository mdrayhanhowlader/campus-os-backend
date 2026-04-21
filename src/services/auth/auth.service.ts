import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../../config/database';
import { cache } from '../../config/redis';
import { AppError } from '../../middleware/errorHandler';
import {
  generateAccessToken,
  generateRefreshToken,
  generateSecureToken,
  parseExpiryToSeconds,
  verifyRefreshToken,
} from '../../utils/token';
import { env } from '../../config/env';
import { writeAuditLog } from '../../middleware/auditLog';
import { AuditAction } from '@prisma/client';

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    schoolId: string;
    schoolName: string;
  };
}

export class AuthService {
  async login(email: string, password: string, schoolCode: string, ipAddress?: string): Promise<LoginResult> {
    // Verify school exists
    const school = await prisma.school.findUnique({
      where: { code: schoolCode },
      select: { id: true, name: true },
    });
    if (!school) throw new AppError('Invalid school code', 401);
    // A real app would check school.isActive here

    // Check rate limiting: max 10 attempts per email per 15 min
    const rateLimitKey = `login_attempts:${email}:${schoolCode}`;
    const attempts = await cache.get<number>(rateLimitKey);
    if (attempts && attempts >= 10) {
      throw new AppError('Too many login attempts. Please wait 15 minutes.', 429);
    }

    const user = await prisma.user.findFirst({
      where: { email, schoolId: school.id },
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
        firstName: true,
        lastName: true,
        avatar: true,
        schoolId: true,
        isActive: true,
        isVerified: true,
      },
    });

    const invalidCredentials = new AppError('Invalid email or password', 401);

    if (!user) {
      // Increment attempts even for non-existent users to prevent enumeration
      await cache.set(rateLimitKey, (attempts || 0) + 1, 900);
      throw invalidCredentials;
    }

    if (!user.isActive) throw new AppError('Your account has been deactivated. Contact admin.', 403);

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      await cache.set(rateLimitKey, (attempts || 0) + 1, 900);
      throw invalidCredentials;
    }

    // Clear rate limit on success
    await cache.del(rateLimitKey);

    // Generate token family id (jti) for refresh token rotation
    const jti = crypto.randomUUID();
    const accessToken = generateAccessToken({
      id: user.id,
      schoolId: user.schoolId,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    });
    const refreshToken = generateRefreshToken(user.id, jti);
    const refreshExpiresAt = new Date(
      Date.now() + parseExpiryToSeconds(env.JWT_REFRESH_EXPIRES_IN) * 1000
    );

    // Persist refresh token
    await prisma.refreshToken.create({
      data: { userId: user.id, token: refreshToken, expiresAt: refreshExpiresAt },
    });

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ipAddress },
    });

    await writeAuditLog({
      schoolId: user.schoolId,
      userId: user.id,
      action: AuditAction.LOGIN,
      entity: 'User',
      entityId: user.id,
      ipAddress,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        schoolId: user.schoolId,
        schoolName: school.name,
      },
    };
  }

  async refreshTokens(token: string): Promise<{ accessToken: string; refreshToken: string }> {
    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    const stored = await prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!stored || stored.isRevoked || stored.expiresAt < new Date()) {
      // Potential token reuse — revoke entire family
      if (stored) {
        await prisma.refreshToken.updateMany({
          where: { userId: stored.userId },
          data: { isRevoked: true },
        });
      }
      throw new AppError('Refresh token is invalid or reused', 401);
    }

    // Rotate: revoke old, issue new
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { isRevoked: true } });

    const jti = crypto.randomUUID();
    const newAccess = generateAccessToken({
      id: stored.user.id,
      schoolId: stored.user.schoolId,
      email: stored.user.email,
      role: stored.user.role,
      firstName: stored.user.firstName,
      lastName: stored.user.lastName,
    });
    const newRefresh = generateRefreshToken(stored.user.id, jti);
    const expiresAt = new Date(
      Date.now() + parseExpiryToSeconds(env.JWT_REFRESH_EXPIRES_IN) * 1000
    );
    await prisma.refreshToken.create({
      data: { userId: stored.user.id, token: newRefresh, expiresAt },
    });

    return { accessToken: newAccess, refreshToken: newRefresh };
  }

  async logout(userId: string, accessToken: string, refreshToken?: string): Promise<void> {
    // Blacklist current access token until it naturally expires (~15 min)
    await cache.set(`blacklist:${accessToken}`, 1, parseExpiryToSeconds(env.JWT_ACCESS_EXPIRES_IN));

    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { userId, token: refreshToken },
        data: { isRevoked: true },
      });
    }
  }

  async logoutAll(userId: string, accessToken: string): Promise<void> {
    await cache.set(`blacklist:${accessToken}`, 1, parseExpiryToSeconds(env.JWT_ACCESS_EXPIRES_IN));
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
  }

  async forgotPassword(email: string, schoolCode: string): Promise<void> {
    const school = await prisma.school.findUnique({ where: { code: schoolCode } });
    if (!school) return; // Silently succeed to prevent enumeration

    const user = await prisma.user.findFirst({
      where: { email, schoolId: school.id },
    });
    if (!user) return;

    const token = generateSecureToken();
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

    await prisma.passwordReset.create({
      data: { userId: user.id, token, expiresAt },
    });

    // TODO: Send email via nodemailer
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const reset = await prisma.passwordReset.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      throw new AppError('Invalid or expired reset token', 400);
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: reset.userId },
        data: { password: hashed, passwordChangedAt: new Date() },
      }),
      prisma.passwordReset.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      }),
      // Revoke all refresh tokens after password reset
      prisma.refreshToken.updateMany({
        where: { userId: reset.userId },
        data: { isRevoked: true },
      }),
    ]);
  }
}

export const authService = new AuthService();

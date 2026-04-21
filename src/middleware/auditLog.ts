import { Response, NextFunction } from 'express';
import { AuditAction } from '@prisma/client';
import { AuthenticatedRequest } from '../types';
import { prisma } from '../config/database';
import { logger } from '../config/logger';

interface AuditOptions {
  action: AuditAction;
  entity: string;
}

/** Middleware factory — attaches audit logging to mutating routes */
export function audit(options: AuditOptions) {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    // Attach audit metadata to request for controller use
    (req as any).__audit = {
      action: options.action,
      entity: options.entity,
      userId: req.user?.id,
      schoolId: req.user?.schoolId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
    next();
  };
}

/** Call from a controller after the operation completes */
export async function writeAuditLog(opts: {
  schoolId: string;
  userId?: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  before?: object | null;
  after?: object | null;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({ data: opts });
  } catch (err) {
    // Audit log failure must never crash the main request
    logger.error('Failed to write audit log:', err);
  }
}

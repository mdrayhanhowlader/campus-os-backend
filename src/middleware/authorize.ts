import { Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { AuthenticatedRequest } from '../types';
import { AppError } from './errorHandler';

/**
 * Role hierarchy — higher index = more privilege.
 * Used for "at least this role" checks.
 */
const ROLE_HIERARCHY: UserRole[] = [
  UserRole.PARENT,
  UserRole.STUDENT,
  UserRole.LIBRARIAN,
  UserRole.ACCOUNTANT,
  UserRole.TRANSPORT_MANAGER,
  UserRole.HOSTEL_WARDEN,
  UserRole.STAFF,
  UserRole.TEACHER,
  UserRole.SCHOOL_ADMIN,
  UserRole.PRINCIPAL,
  UserRole.SUPER_ADMIN,
];

/** Middleware: user must have one of the specified roles */
export function authorize(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(
        `Access denied. Required roles: ${allowedRoles.join(', ')}`,
        403
      );
    }
    next();
  };
}

/** Middleware: user must have at least the minimum role in the hierarchy */
export function authorizeMinRole(minimumRole: UserRole) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }
    const userIndex = ROLE_HIERARCHY.indexOf(req.user.role);
    const minIndex = ROLE_HIERARCHY.indexOf(minimumRole);

    if (userIndex < minIndex) {
      throw new AppError('Insufficient permissions', 403);
    }
    next();
  };
}

/** Guard: ensure user can only access their own school's data */
export function requireSameSchool(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const { schoolId } = req.params;
  if (schoolId && schoolId !== req.user.schoolId && req.user.role !== UserRole.SUPER_ADMIN) {
    throw new AppError('Access to this school is not permitted', 403);
  }
  next();
}

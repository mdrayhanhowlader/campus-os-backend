import { Request } from 'express';
import { UserRole } from '@prisma/client';

// ─── Augment Express Request ────────────────────────────────────
export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    schoolId: string;
    email: string;
    role: UserRole;
    firstName: string;
    lastName: string;
  };
}

// ─── API Response Shapes ────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  meta?: PaginationMeta;
  errors?: ValidationError[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ValidationError {
  field: string;
  message: string;
}

// ─── JWT Payloads ───────────────────────────────────────────────
export interface AccessTokenPayload {
  sub: string;       // userId
  schoolId: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;       // userId
  jti: string;       // token family id
  iat?: number;
  exp?: number;
}

// ─── Misc Helpers ───────────────────────────────────────────────
export type SortOrder = 'asc' | 'desc';

export interface DateRange {
  from: Date;
  to: Date;
}

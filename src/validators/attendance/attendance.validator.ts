import { z } from 'zod';
import { AttendanceStatus } from '@prisma/client';

export const markAttendanceSchema = z.object({
  body: z.object({
    classId: z.string().cuid('Invalid class ID'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
    termId: z.string().cuid().optional(),
    records: z
      .array(
        z.object({
          studentId: z.string().cuid('Invalid student ID'),
          status: z.nativeEnum(AttendanceStatus),
          timeIn: z.string().optional(),
          timeOut: z.string().optional(),
          remarks: z.string().max(500).optional(),
        })
      )
      .min(1, 'At least one attendance record is required'),
  }),
});

export const getAttendanceSchema = z.object({
  query: z.object({
    classId: z.string().cuid().optional(),
    studentId: z.string().cuid().optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    status: z.nativeEnum(AttendanceStatus).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  }),
});

export const attendanceSummarySchema = z.object({
  params: z.object({
    studentId: z.string().cuid(),
  }),
  query: z.object({
    termId: z.string().cuid().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  }),
});

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>['body'];

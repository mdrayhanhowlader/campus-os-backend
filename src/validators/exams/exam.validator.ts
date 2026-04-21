import { z } from 'zod';
import { ExamType } from '@prisma/client';

export const submitExamResultsSchema = z.object({
  body: z.object({
    examId: z.string().cuid('Invalid exam ID'),
    results: z
      .array(
        z.object({
          studentId: z.string().cuid(),
          marksObtained: z.number().min(0).nullable().optional(),
          isAbsent: z.boolean().default(false),
          remarks: z.string().max(500).optional(),
        })
      )
      .min(1),
    publish: z.boolean().default(false),
  }),
});

export const createExamSchema = z.object({
  body: z.object({
    academicYearId: z.string().cuid(),
    termId: z.string().cuid().optional(),
    subjectId: z.string().cuid(),
    name: z.string().min(1).max(100),
    examType: z.nativeEnum(ExamType),
    date: z.string().datetime({ offset: true }),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    totalMarks: z.number().positive(),
    passingMarks: z.number().positive(),
    duration: z.number().int().positive().optional(),
    venue: z.string().optional(),
    instructions: z.string().optional(),
  }),
});

export const listExamResultsSchema = z.object({
  params: z.object({ examId: z.string().cuid() }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    search: z.string().optional(),
  }),
});

export type SubmitExamResultsInput = z.infer<typeof submitExamResultsSchema>['body'];

import { z } from 'zod';
import { Gender, BloodGroup } from '@prisma/client';

const studentBodySchema = z.object({
  // User fields
  email: z.string().email(),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  middleName: z.string().max(50).optional(),
  phone: z.string().optional(),
  password: z.string().min(8).optional(), // auto-generated if omitted

  // Student-specific fields
  gender: z.nativeEnum(Gender),
  dateOfBirth: z.string().datetime({ offset: true }),
  bloodGroup: z.nativeEnum(BloodGroup).default(BloodGroup.UNKNOWN),
  nationality: z.string().optional(),
  religion: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  admissionDate: z.string().datetime({ offset: true }).optional(),
  previousSchool: z.string().optional(),
  medicalConditions: z.string().optional(),
  allergies: z.string().optional(),
  emergencyContact: z.string().min(1, 'Emergency contact name required'),
  emergencyPhone: z.string().min(1, 'Emergency contact phone required'),
  emergencyRelation: z.string().optional(),

  // Enrollment
  classId: z.string().cuid('Invalid class ID'),
});

export const createStudentSchema = z.object({
  body: studentBodySchema,
});

export const updateStudentSchema = z.object({
  params: z.object({ id: z.string().cuid() }),
  body: studentBodySchema.partial(),
});

export const listStudentsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
    classId: z.string().cuid().optional(),
    gender: z.nativeEnum(Gender).optional(),
    isAlumni: z.coerce.boolean().optional(),
    sortBy: z.enum(['firstName', 'lastName', 'admissionNumber', 'createdAt']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const studentParamSchema = z.object({
  params: z.object({ id: z.string().cuid() }),
});

export type CreateStudentInput = z.infer<typeof createStudentSchema>['body'];
export type ListStudentsQuery = z.infer<typeof listStudentsSchema>['query'];

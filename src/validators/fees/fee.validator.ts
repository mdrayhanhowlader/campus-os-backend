import { z } from 'zod';
import { FeeStatus, PaymentMethod } from '@prisma/client';

export const createInvoiceSchema = z.object({
  body: z.object({
    studentId: z.string().cuid(),
    academicYearId: z.string().cuid(),
    dueDate: z.string().datetime({ offset: true }),
    notes: z.string().optional(),
    items: z
      .array(
        z.object({
          feeCategoryId: z.string().cuid(),
          description: z.string().min(1),
          amount: z.number().positive(),
          discount: z.number().min(0).default(0),
        })
      )
      .min(1, 'At least one fee item is required'),
  }),
});

export const listInvoicesSchema = z.object({
  params: z.object({
    studentId: z.string().cuid(),
  }),
  query: z.object({
    status: z.nativeEnum(FeeStatus).optional(),
    academicYearId: z.string().cuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  }),
});

export const recordPaymentSchema = z.object({
  params: z.object({
    invoiceId: z.string().cuid(),
  }),
  body: z.object({
    amount: z.number().positive('Payment amount must be positive'),
    method: z.nativeEnum(PaymentMethod),
    transactionId: z.string().optional(),
    remarks: z.string().optional(),
  }),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>['body'];
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>['body'];

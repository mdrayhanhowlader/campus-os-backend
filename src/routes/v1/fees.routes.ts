import { Router } from 'express';
import { feeController } from '../../controllers/fees/fee.controller';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { UserRole } from '@prisma/client';
import {
  createInvoiceSchema,
  listInvoicesSchema,
  recordPaymentSchema,
} from '../../validators/fees/fee.validator';

const router = Router();
const auth = authenticate as any;
const financeRoles = [UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT];
const viewRoles = [...financeRoles, UserRole.PRINCIPAL, UserRole.PARENT, UserRole.STUDENT];

router.use(auth);

router.get('/invoices/:studentId', validate(listInvoicesSchema), authorize(...viewRoles), feeController.getStudentInvoices.bind(feeController));
router.post('/invoices', validate(createInvoiceSchema), authorize(...financeRoles), feeController.createInvoice.bind(feeController));
router.get('/invoices/:invoiceId/detail', authorize(...viewRoles), feeController.getInvoice.bind(feeController));
router.post('/invoices/:invoiceId/payment', validate(recordPaymentSchema), authorize(...financeRoles), feeController.recordPayment.bind(feeController));
router.get('/summary', authorize(...financeRoles), feeController.financialSummary.bind(feeController));

export default router;

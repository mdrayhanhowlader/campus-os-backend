import { Response } from 'express';
import { AuthenticatedRequest } from '../../types';
import { feeService } from '../../services/fees/fee.service';
import { sendSuccess, sendCreated } from '../../utils/response';

export class FeeController {
  async getStudentInvoices(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { invoices, meta, summary } = await feeService.getStudentInvoices(
      req.params.studentId,
      req.user.schoolId,
      req.query
    );
    sendSuccess(res, { invoices, summary }, 'Invoices fetched', 200, meta);
  }

  async createInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    const invoice = await feeService.createInvoice(req.user.schoolId, req.body);
    sendCreated(res, invoice, 'Invoice created successfully');
  }

  async getInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    const invoice = await feeService.getInvoiceById(req.params.invoiceId);
    sendSuccess(res, invoice, 'Invoice fetched');
  }

  async recordPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await feeService.recordPayment(
      req.params.invoiceId,
      req.user.schoolId,
      req.body,
      req.user.id
    );
    sendSuccess(res, result, 'Payment recorded successfully');
  }

  async financialSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
    const data = await feeService.getFinancialSummary(
      req.user.schoolId,
      req.query.academicYearId as string | undefined
    );
    sendSuccess(res, data, 'Financial summary fetched');
  }
}

export const feeController = new FeeController();

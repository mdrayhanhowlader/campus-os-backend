import { FeeStatus, PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { CreateInvoiceInput, RecordPaymentInput } from '../../validators/fees/fee.validator';
import { paginate } from '../../utils/response';

export class FeeService {
  private async generateInvoiceNumber(schoolId: string): Promise<string> {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const prefix = `INV-${year}${month}-`;

    const last = await prisma.feeInvoice.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });
    const seq = last ? parseInt(last.invoiceNumber.replace(prefix, ''), 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  async getStudentInvoices(studentId: string, schoolId: string, query: any) {
    const { status, academicYearId, page, limit } = query;
    const skip = (page - 1) * limit;

    // Ensure student belongs to school
    const student = await prisma.student.findFirst({
      where: { id: studentId, user: { schoolId } },
    });
    if (!student) throw new AppError('Student not found', 404);

    const where: Prisma.FeeInvoiceWhereInput = {
      studentId,
      ...(status && { status }),
      ...(academicYearId && { academicYearId }),
    };

    const [invoices, total] = await prisma.$transaction([
      prisma.feeInvoice.findMany({
        where,
        include: {
          items: {
            include: { feeCategory: { select: { name: true, code: true } } },
          },
          payments: {
            where: { status: PaymentStatus.COMPLETED },
            select: { id: true, amount: true, method: true, paidAt: true, receiptNumber: true },
            orderBy: { paidAt: 'desc' },
          },
          academicYear: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.feeInvoice.count({ where }),
    ]);

    // Compute outstanding summary
    const summary = await prisma.feeInvoice.aggregate({
      where: { studentId },
      _sum: { totalAmount: true, paidAmount: true, balanceAmount: true },
    });

    return {
      invoices,
      meta: paginate(page, limit, total),
      summary: {
        totalDue: summary._sum.totalAmount || 0,
        totalPaid: summary._sum.paidAmount || 0,
        totalOutstanding: summary._sum.balanceAmount || 0,
      },
    };
  }

  async createInvoice(schoolId: string, data: CreateInvoiceInput) {
    const student = await prisma.student.findFirst({
      where: { id: data.studentId, user: { schoolId } },
    });
    if (!student) throw new AppError('Student not found', 404);

    const invoiceNumber = await this.generateInvoiceNumber(schoolId);

    const totalAmount = data.items.reduce((sum, item) => sum + item.amount, 0);
    const discountAmount = data.items.reduce((sum, item) => sum + (item.discount || 0), 0);
    const balanceAmount = totalAmount - discountAmount;

    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.feeInvoice.create({
        data: {
          invoiceNumber,
          studentId: data.studentId,
          academicYearId: data.academicYearId,
          dueDate: new Date(data.dueDate),
          totalAmount,
          discountAmount,
          balanceAmount,
          paidAmount: 0,
          status: FeeStatus.PENDING,
          notes: data.notes,
        },
      });

      await tx.feeInvoiceItem.createMany({
        data: data.items.map((item) => ({
          invoiceId: inv.id,
          feeCategoryId: item.feeCategoryId,
          description: item.description,
          amount: item.amount,
          discount: item.discount || 0,
          netAmount: item.amount - (item.discount || 0),
        })),
      });

      return inv;
    });

    return this.getInvoiceById(invoice.id);
  }

  async getInvoiceById(id: string) {
    const invoice = await prisma.feeInvoice.findUnique({
      where: { id },
      include: {
        student: {
          select: {
            admissionNumber: true,
            user: { select: { firstName: true, lastName: true, email: true, phone: true } },
            enrollments: {
              where: { isActive: true },
              include: { class: { select: { name: true, grade: true, section: true } } },
              take: 1,
            },
          },
        },
        items: { include: { feeCategory: true } },
        payments: { orderBy: { createdAt: 'desc' } },
        academicYear: true,
      },
    });
    if (!invoice) throw new AppError('Invoice not found', 404);
    return invoice;
  }

  async recordPayment(invoiceId: string, schoolId: string, data: RecordPaymentInput, collectedById: string) {
    const invoice = await prisma.feeInvoice.findUnique({
      where: { id: invoiceId },
      include: { student: { include: { user: true } } },
    });

    if (!invoice) throw new AppError('Invoice not found', 404);
    if (invoice.student.user.schoolId !== schoolId) throw new AppError('Access denied', 403);
    if (invoice.status === FeeStatus.PAID) throw new AppError('Invoice is already fully paid', 400);
    if (invoice.status === FeeStatus.CANCELLED) throw new AppError('Invoice has been cancelled', 400);

    if (data.amount > invoice.balanceAmount) {
      throw new AppError(
        `Payment amount (${data.amount}) exceeds outstanding balance (${invoice.balanceAmount})`,
        400
      );
    }

    const year = new Date().getFullYear();
    const receiptSeq = await prisma.payment.count();
    const receiptNumber = `RCP-${year}-${String(receiptSeq + 1).padStart(6, '0')}`;

    const payment = await prisma.$transaction(async (tx) => {
      const pmt = await tx.payment.create({
        data: {
          invoiceId,
          amount: data.amount,
          method: data.method,
          status: PaymentStatus.COMPLETED,
          transactionId: data.transactionId,
          receiptNumber,
          remarks: data.remarks,
          paidAt: new Date(),
          collectedById,
        },
      });

      const newPaid = invoice.paidAmount + data.amount;
      const newBalance = invoice.totalAmount - invoice.discountAmount - newPaid;
      const newStatus: FeeStatus =
        newBalance <= 0
          ? FeeStatus.PAID
          : newPaid > 0
          ? FeeStatus.PARTIAL
          : FeeStatus.PENDING;

      await tx.feeInvoice.update({
        where: { id: invoiceId },
        data: { paidAmount: newPaid, balanceAmount: Math.max(0, newBalance), status: newStatus },
      });

      return pmt;
    });

    return { payment, receiptNumber };
  }

  async getFinancialSummary(schoolId: string, academicYearId?: string) {
    const where: Prisma.FeeInvoiceWhereInput = {
      student: { user: { schoolId } },
      ...(academicYearId && { academicYearId }),
    };

    const [byStatus, totalRevenue, recentPayments] = await Promise.all([
      prisma.feeInvoice.groupBy({
        by: ['status'],
        where,
        _count: true,
        _sum: { totalAmount: true, paidAmount: true, balanceAmount: true },
      }),
      prisma.payment.aggregate({
        where: {
          status: PaymentStatus.COMPLETED,
          invoice: { student: { user: { schoolId } } },
          ...(academicYearId && { invoice: { academicYearId } }),
        },
        _sum: { amount: true },
      }),
      prisma.payment.findMany({
        where: {
          status: PaymentStatus.COMPLETED,
          invoice: { student: { user: { schoolId } } },
        },
        select: {
          amount: true,
          method: true,
          paidAt: true,
          receiptNumber: true,
          invoice: {
            select: {
              student: {
                select: { user: { select: { firstName: true, lastName: true } } },
              },
            },
          },
        },
        orderBy: { paidAt: 'desc' },
        take: 10,
      }),
    ]);

    return { byStatus, totalRevenue: totalRevenue._sum.amount || 0, recentPayments };
  }
}

export const feeService = new FeeService();

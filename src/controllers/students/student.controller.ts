import { Response } from 'express';
import { AuthenticatedRequest } from '../../types';
import { studentService } from '../../services/students/student.service';
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/response';
import { writeAuditLog } from '../../middleware/auditLog';
import { AuditAction } from '@prisma/client';

export class StudentController {
  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { students, meta } = await studentService.list(req.user.schoolId, req.query as any);
    sendSuccess(res, students, 'Students fetched', 200, meta);
  }

  async findOne(req: AuthenticatedRequest, res: Response): Promise<void> {
    const student = await studentService.findById(req.params.id, req.user.schoolId);
    sendSuccess(res, student, 'Student fetched');
  }

  async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    const student = await studentService.create(req.user.schoolId, req.body);
    await writeAuditLog({
      schoolId: req.user.schoolId,
      userId: req.user.id,
      action: AuditAction.CREATE,
      entity: 'Student',
      entityId: (student as any).id,
      after: student as object,
      ipAddress: req.ip,
    });
    sendCreated(res, student, 'Student enrolled successfully');
  }

  async update(req: AuthenticatedRequest, res: Response): Promise<void> {
    const student = await studentService.update(req.params.id, req.user.schoolId, req.body);
    await writeAuditLog({
      schoolId: req.user.schoolId,
      userId: req.user.id,
      action: AuditAction.UPDATE,
      entity: 'Student',
      entityId: req.params.id,
      after: student as object,
      ipAddress: req.ip,
    });
    sendSuccess(res, student, 'Student updated successfully');
  }

  async remove(req: AuthenticatedRequest, res: Response): Promise<void> {
    await studentService.delete(req.params.id, req.user.schoolId);
    await writeAuditLog({
      schoolId: req.user.schoolId,
      userId: req.user.id,
      action: AuditAction.DELETE,
      entity: 'Student',
      entityId: req.params.id,
      ipAddress: req.ip,
    });
    sendNoContent(res);
  }

  async stats(req: AuthenticatedRequest, res: Response): Promise<void> {
    const data = await studentService.getDashboardStats(req.user.schoolId);
    sendSuccess(res, data, 'Student stats fetched');
  }
}

export const studentController = new StudentController();

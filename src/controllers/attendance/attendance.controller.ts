import { Response } from 'express';
import { AuthenticatedRequest } from '../../types';
import { attendanceService } from '../../services/attendance/attendance.service';
import { sendSuccess } from '../../utils/response';

export class AttendanceController {
  async mark(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await attendanceService.markAttendance(
      req.user.schoolId,
      req.user.id,
      req.body
    );
    sendSuccess(res, result, 'Attendance marked successfully');
  }

  async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { records, meta } = await attendanceService.getAttendance(
      req.user.schoolId,
      req.query
    );
    sendSuccess(res, records, 'Attendance records fetched', 200, meta);
  }

  async summary(req: AuthenticatedRequest, res: Response): Promise<void> {
    const data = await attendanceService.getStudentSummary(
      req.params.studentId,
      req.user.schoolId,
      req.query
    );
    sendSuccess(res, data, 'Attendance summary fetched');
  }
}

export const attendanceController = new AttendanceController();

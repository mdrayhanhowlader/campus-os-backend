import { Router } from 'express';
import { attendanceController } from '../../controllers/attendance/attendance.controller';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { UserRole } from '@prisma/client';
import {
  markAttendanceSchema,
  getAttendanceSchema,
  attendanceSummarySchema,
} from '../../validators/attendance/attendance.validator';

const router = Router();
const auth = authenticate as any;
const canMark = [UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.PRINCIPAL, UserRole.TEACHER];
const canView = [...canMark, UserRole.PARENT, UserRole.STUDENT];

router.use(auth);

router.post('/mark', validate(markAttendanceSchema), authorize(...canMark), attendanceController.mark.bind(attendanceController));
router.get('/', validate(getAttendanceSchema), authorize(...canView), attendanceController.list.bind(attendanceController));
router.get('/summary/:studentId', validate(attendanceSummarySchema), authorize(...canView), attendanceController.summary.bind(attendanceController));

export default router;

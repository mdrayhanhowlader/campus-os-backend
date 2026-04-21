import { Router } from 'express';
import { studentController } from '../../controllers/students/student.controller';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { UserRole } from '@prisma/client';
import {
  createStudentSchema,
  updateStudentSchema,
  listStudentsSchema,
  studentParamSchema,
} from '../../validators/students/student.validator';

const router = Router();
const auth = authenticate as any;
const adminRoles = [UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.PRINCIPAL];
const teacherAndAbove = [...adminRoles, UserRole.TEACHER];

router.use(auth);

router.get('/', validate(listStudentsSchema), authorize(...teacherAndAbove), studentController.list.bind(studentController));
router.get('/stats', authorize(...adminRoles), studentController.stats.bind(studentController));
router.get('/:id', validate(studentParamSchema), authorize(...teacherAndAbove), studentController.findOne.bind(studentController));
router.post('/', validate(createStudentSchema), authorize(...adminRoles), studentController.create.bind(studentController));
router.patch('/:id', validate(updateStudentSchema), authorize(...adminRoles), studentController.update.bind(studentController));
router.delete('/:id', authorize(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN), studentController.remove.bind(studentController));

export default router;

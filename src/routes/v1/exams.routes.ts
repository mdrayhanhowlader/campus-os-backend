import { Router } from 'express';
import { examController } from '../../controllers/exams/exam.controller';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { validate } from '../../middleware/validate';
import { UserRole } from '@prisma/client';
import { submitExamResultsSchema, listExamResultsSchema } from '../../validators/exams/exam.validator';

const router = Router();
const auth = authenticate as any;
const canGrade = [UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER, UserRole.PRINCIPAL];
const canView = [...canGrade, UserRole.PARENT, UserRole.STUDENT];

router.use(auth);

router.post('/results', validate(submitExamResultsSchema), authorize(...canGrade), examController.submitResults.bind(examController));
router.get('/:examId/results', validate(listExamResultsSchema), authorize(...canView), examController.listResults.bind(examController));
router.get('/report-card/:studentId', authorize(...canView), examController.reportCard.bind(examController));

export default router;

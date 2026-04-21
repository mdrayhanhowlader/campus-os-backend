import { Response } from 'express';
import { AuthenticatedRequest } from '../../types';
import { examService } from '../../services/exams/exam.service';
import { sendSuccess, sendCreated } from '../../utils/response';

export class ExamController {
  async submitResults(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await examService.submitResults(req.user.schoolId, req.user.id, req.body);
    sendSuccess(res, result, 'Exam results submitted successfully');
  }

  async listResults(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { results, meta } = await examService.getExamResults(
      req.params.examId,
      req.user.schoolId,
      req.query
    );
    sendSuccess(res, results, 'Exam results fetched', 200, meta);
  }

  async reportCard(req: AuthenticatedRequest, res: Response): Promise<void> {
    const data = await examService.getStudentReportCard(
      req.params.studentId,
      req.query.academicYearId as string,
      req.user.schoolId
    );
    sendSuccess(res, data, 'Report card fetched');
  }
}

export const examController = new ExamController();

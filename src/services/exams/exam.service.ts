import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { SubmitExamResultsInput } from '../../validators/exams/exam.validator';
import { paginate } from '../../utils/response';

interface GradeConfig {
  label: string;
  minScore: number;
  gpa: number;
}

const DEFAULT_GRADES: GradeConfig[] = [
  { label: 'A+', minScore: 97, gpa: 4.0 },
  { label: 'A',  minScore: 93, gpa: 4.0 },
  { label: 'A-', minScore: 90, gpa: 3.7 },
  { label: 'B+', minScore: 87, gpa: 3.3 },
  { label: 'B',  minScore: 83, gpa: 3.0 },
  { label: 'B-', minScore: 80, gpa: 2.7 },
  { label: 'C+', minScore: 77, gpa: 2.3 },
  { label: 'C',  minScore: 73, gpa: 2.0 },
  { label: 'C-', minScore: 70, gpa: 1.7 },
  { label: 'D+', minScore: 67, gpa: 1.3 },
  { label: 'D',  minScore: 65, gpa: 1.0 },
  { label: 'F',  minScore: 0,  gpa: 0.0 },
];

function calculateGrade(percentage: number, grades: GradeConfig[] = DEFAULT_GRADES) {
  const sorted = [...grades].sort((a, b) => b.minScore - a.minScore);
  const match = sorted.find((g) => percentage >= g.minScore);
  return match ?? { label: 'F', gpa: 0.0 };
}

export class ExamService {
  async submitResults(schoolId: string, gradedById: string, input: SubmitExamResultsInput) {
    const { examId, results, publish } = input;

    const exam = await prisma.exam.findFirst({
      where: { id: examId, academicYear: { schoolId } },
      include: {
        subject: { select: { name: true } },
        academicYear: {
          include: {
            school: { include: { settings: true } },
          },
        },
      },
    });
    if (!exam) throw new AppError('Exam not found', 404);

    // Fetch custom grade config from school settings if available
    const customGrades = exam.academicYear.school.settings?.customGrades as GradeConfig[] | null;

    const upsertedResults = await prisma.$transaction(
      results.map((r) => {
        let grade: string | undefined;
        let gpa: number | undefined;
        let percentage: number | undefined;

        if (!r.isAbsent && r.marksObtained != null) {
          percentage = (r.marksObtained / exam.totalMarks) * 100;
          const gradeResult = calculateGrade(percentage, customGrades ?? DEFAULT_GRADES);
          grade = gradeResult.label;
          gpa = gradeResult.gpa;
        }

        return prisma.examResult.upsert({
          where: { examId_studentId: { examId, studentId: r.studentId } },
          create: {
            examId,
            studentId: r.studentId,
            marksObtained: r.isAbsent ? null : (r.marksObtained ?? null),
            isAbsent: r.isAbsent,
            grade,
            gpa,
            percentage: percentage !== undefined ? parseFloat(percentage.toFixed(2)) : null,
            remarks: r.remarks,
            gradedById,
            isPublished: publish,
            publishedAt: publish ? new Date() : null,
          },
          update: {
            marksObtained: r.isAbsent ? null : (r.marksObtained ?? null),
            isAbsent: r.isAbsent,
            grade,
            gpa,
            percentage: percentage !== undefined ? parseFloat(percentage.toFixed(2)) : null,
            remarks: r.remarks,
            gradedById,
            ...(publish && { isPublished: true, publishedAt: new Date() }),
          },
        });
      })
    );

    // Calculate ranks after all marks are entered
    if (results.some((r) => r.marksObtained != null)) {
      await this.recalculateRanks(examId);
    }

    return {
      examId,
      examName: exam.name,
      subject: exam.subject.name,
      totalSubmitted: upsertedResults.length,
      published: publish,
      summary: this.buildSummary(upsertedResults, exam.totalMarks, exam.passingMarks),
    };
  }

  private buildSummary(results: any[], totalMarks: number, passingMarks: number) {
    const present = results.filter((r) => !r.isAbsent);
    const passed = present.filter(
      (r) => r.marksObtained != null && r.marksObtained >= passingMarks
    );
    const marks = present.map((r) => r.marksObtained ?? 0).filter((m) => m > 0);

    return {
      totalStudents: results.length,
      appeared: present.length,
      absent: results.length - present.length,
      passed: passed.length,
      failed: present.length - passed.length,
      passPercentage: present.length > 0 ? parseFloat(((passed.length / present.length) * 100).toFixed(2)) : 0,
      highestMarks: marks.length > 0 ? Math.max(...marks) : 0,
      lowestMarks: marks.length > 0 ? Math.min(...marks) : 0,
      averageMarks: marks.length > 0 ? parseFloat((marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(2)) : 0,
    };
  }

  private async recalculateRanks(examId: string): Promise<void> {
    const results = await prisma.examResult.findMany({
      where: { examId, isAbsent: false, marksObtained: { not: null } },
      orderBy: { marksObtained: 'desc' },
      select: { id: true },
    });

    await prisma.$transaction(
      results.map((r, index) =>
        prisma.examResult.update({
          where: { id: r.id },
          data: { rank: index + 1 },
        })
      )
    );
  }

  async getExamResults(examId: string, schoolId: string, query: any) {
    const { page, limit, search } = query;
    const skip = (page - 1) * limit;

    const exam = await prisma.exam.findFirst({
      where: { id: examId, academicYear: { schoolId } },
    });
    if (!exam) throw new AppError('Exam not found', 404);

    const where: Prisma.ExamResultWhereInput = {
      examId,
      ...(search && {
        student: {
          OR: [
            { admissionNumber: { contains: search, mode: 'insensitive' } },
            { user: { firstName: { contains: search, mode: 'insensitive' } } },
            { user: { lastName: { contains: search, mode: 'insensitive' } } },
          ],
        },
      }),
    };

    const [results, total] = await prisma.$transaction([
      prisma.examResult.findMany({
        where,
        include: {
          student: {
            select: {
              admissionNumber: true,
              rollNumber: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: [{ rank: 'asc' }, { marksObtained: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.examResult.count({ where }),
    ]);

    return { results, meta: paginate(page, limit, total) };
  }

  async getStudentReportCard(studentId: string, academicYearId: string, schoolId: string) {
    const student = await prisma.student.findFirst({
      where: { id: studentId, user: { schoolId } },
      select: {
        admissionNumber: true,
        user: { select: { firstName: true, lastName: true } },
        enrollments: {
          where: { isActive: true },
          include: { class: { select: { name: true, grade: true, section: true } } },
          take: 1,
        },
      },
    });
    if (!student) throw new AppError('Student not found', 404);

    const results = await prisma.examResult.findMany({
      where: { studentId, exam: { academicYearId }, isPublished: true },
      include: {
        exam: {
          select: { name: true, examType: true, totalMarks: true, passingMarks: true, subject: { select: { name: true, code: true } } },
        },
      },
      orderBy: { exam: { subject: { name: 'asc' } } },
    });

    // Group by subject
    const bySubject = results.reduce<Record<string, typeof results>>((acc, r) => {
      const key = r.exam.subject.code;
      if (!acc[key]) acc[key] = [];
      acc[key].push(r);
      return acc;
    }, {});

    // Compute cumulative GPA
    const allGpas = results.filter((r) => r.gpa != null).map((r) => r.gpa!);
    const cumulativeGpa =
      allGpas.length > 0
        ? parseFloat((allGpas.reduce((a, b) => a + b, 0) / allGpas.length).toFixed(2))
        : null;

    return { student, results: bySubject, cumulativeGpa, totalExams: results.length };
  }
}

export const examService = new ExamService();

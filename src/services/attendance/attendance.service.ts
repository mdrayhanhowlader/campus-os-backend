import { AttendanceStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { MarkAttendanceInput } from '../../validators/attendance/attendance.validator';
import { paginate } from '../../utils/response';
import { NotificationService } from '../notifications/notification.service';

export class AttendanceService {
  private notificationService = new NotificationService();

  async markAttendance(schoolId: string, markedById: string, input: MarkAttendanceInput) {
    const { classId, date, termId, records } = input;
    const attendanceDate = new Date(date);

    // Validate date is not in the future
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (attendanceDate > today) {
      throw new AppError('Cannot mark attendance for a future date', 400);
    }

    // Verify class belongs to school
    const cls = await prisma.class.findFirst({
      where: { id: classId, schoolId },
      select: { id: true, name: true, grade: true, section: true },
    });
    if (!cls) throw new AppError('Class not found', 404);

    // Verify all students are enrolled in this class
    const studentIds = records.map((r) => r.studentId);
    const enrolledStudents = await prisma.enrollment.findMany({
      where: { classId, studentId: { in: studentIds }, isActive: true },
      select: { studentId: true },
    });
    const enrolledIds = new Set(enrolledStudents.map((e) => e.studentId));
    const invalidIds = studentIds.filter((id) => !enrolledIds.has(id));
    if (invalidIds.length > 0) {
      throw new AppError(`Students not enrolled in this class: ${invalidIds.join(', ')}`, 400);
    }

    // Upsert attendance records in a transaction
    const results = await prisma.$transaction(
      records.map((record) =>
        prisma.attendance.upsert({
          where: { studentId_date: { studentId: record.studentId, date: attendanceDate } },
          create: {
            studentId: record.studentId,
            date: attendanceDate,
            status: record.status,
            termId: termId || null,
            timeIn: record.timeIn ? new Date(`${date}T${record.timeIn}`) : null,
            timeOut: record.timeOut ? new Date(`${date}T${record.timeOut}`) : null,
            remarks: record.remarks,
            markedById,
          },
          update: {
            status: record.status,
            timeIn: record.timeIn ? new Date(`${date}T${record.timeIn}`) : null,
            timeOut: record.timeOut ? new Date(`${date}T${record.timeOut}`) : null,
            remarks: record.remarks,
            markedById,
          },
        })
      )
    );

    // Notify parents of absent students asynchronously
    const absentRecords = records.filter(
      (r) => r.status === AttendanceStatus.ABSENT || r.status === AttendanceStatus.LATE
    );
    if (absentRecords.length > 0) {
      this.notifyParentsOfAbsences(absentRecords.map((r) => r.studentId), date, cls.name).catch(
        (err) => console.error('Parent notification failed:', err)
      );
    }

    return {
      date,
      classId,
      className: `${cls.name} - Section ${cls.section}`,
      totalMarked: results.length,
      presentCount: records.filter((r) => r.status === AttendanceStatus.PRESENT).length,
      absentCount: records.filter((r) => r.status === AttendanceStatus.ABSENT).length,
      lateCount: records.filter((r) => r.status === AttendanceStatus.LATE).length,
      excusedCount: records.filter((r) => r.status === AttendanceStatus.EXCUSED).length,
    };
  }

  private async notifyParentsOfAbsences(
    studentIds: string[],
    date: string,
    className: string
  ): Promise<void> {
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true,
        user: { select: { firstName: true, lastName: true } },
        parents: {
          where: { isPrimary: true },
          select: {
            parent: {
              select: { userId: true, user: { select: { phone: true, email: true } } },
            },
          },
        },
      },
    });

    for (const student of students) {
      const fullName = `${student.user.firstName} ${student.user.lastName}`;
      for (const { parent } of student.parents) {
        await this.notificationService.create({
          userId: parent.userId,
          type: 'ATTENDANCE',
          title: 'Attendance Alert',
          message: `${fullName} was marked absent from ${className} on ${date}.`,
          data: { studentId: student.id, date, className },
        });
      }
    }
  }

  async getAttendance(schoolId: string, query: any) {
    const { classId, studentId, from, to, status, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AttendanceWhereInput = {
      student: { user: { schoolId } },
      ...(studentId && { studentId }),
      ...(status && { status }),
      ...(classId && {
        student: { enrollments: { some: { classId, isActive: true } } },
      }),
      ...((from || to) && {
        date: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        },
      }),
    };

    const [records, total] = await prisma.$transaction([
      prisma.attendance.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              admissionNumber: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.attendance.count({ where }),
    ]);

    return { records, meta: paginate(page, limit, total) };
  }

  async getStudentSummary(studentId: string, schoolId: string, query: any) {
    // Verify student belongs to school
    const student = await prisma.student.findFirst({
      where: { id: studentId, user: { schoolId } },
    });
    if (!student) throw new AppError('Student not found', 404);

    const where: Prisma.AttendanceWhereInput = {
      studentId,
      ...(query.termId && { termId: query.termId }),
      ...((query.from || query.to) && {
        date: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: new Date(query.to) }),
        },
      }),
    };

    const [all, byStatus, monthly] = await prisma.$transaction([
      prisma.attendance.count({ where }),
      prisma.attendance.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      prisma.attendance.findMany({
        where,
        select: { date: true, status: true },
        orderBy: { date: 'asc' },
      }),
    ]);

    const counts = Object.fromEntries(byStatus.map((b) => [b.status, b._count]));
    const presentCount = counts['PRESENT'] || 0;
    const absentCount = counts['ABSENT'] || 0;
    const lateCount = counts['LATE'] || 0;
    const excusedCount = counts['EXCUSED'] || 0;
    const percentage = all > 0 ? ((presentCount + excusedCount) / all) * 100 : 0;

    return {
      studentId,
      totalDays: all,
      presentCount,
      absentCount,
      lateCount,
      excusedCount,
      attendancePercentage: parseFloat(percentage.toFixed(2)),
      records: monthly,
    };
  }
}

export const attendanceService = new AttendanceService();

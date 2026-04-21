import bcrypt from 'bcryptjs';
import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/database';
import { cache } from '../../config/redis';
import { AppError } from '../../middleware/errorHandler';
import { CreateStudentInput, ListStudentsQuery } from '../../validators/students/student.validator';
import { paginate } from '../../utils/response';

// Shared select clause — never return password to clients
const studentSelect = {
  id: true,
  admissionNumber: true,
  rollNumber: true,
  gender: true,
  dateOfBirth: true,
  bloodGroup: true,
  nationality: true,
  religion: true,
  photo: true,
  address: true,
  city: true,
  state: true,
  country: true,
  admissionDate: true,
  previousSchool: true,
  medicalConditions: true,
  allergies: true,
  emergencyContact: true,
  emergencyPhone: true,
  emergencyRelation: true,
  isAlumni: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      middleName: true,
      phone: true,
      avatar: true,
      isActive: true,
    },
  },
  enrollments: {
    where: { isActive: true },
    select: {
      id: true,
      rollNumber: true,
      class: {
        select: { id: true, name: true, grade: true, section: true },
      },
    },
  },
  parents: {
    select: {
      relation: true,
      isPrimary: true,
      parent: {
        select: {
          user: {
            select: { firstName: true, lastName: true, email: true, phone: true },
          },
        },
      },
    },
  },
} satisfies Prisma.StudentSelect;

export class StudentService {
  /** Generate a sequential admission number: "SCH-2024-00001" */
  private async generateAdmissionNumber(schoolId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `STU-${year}-`;

    const last = await prisma.student.findFirst({
      where: { admissionNumber: { startsWith: prefix } },
      orderBy: { admissionNumber: 'desc' },
      select: { admissionNumber: true },
    });

    const nextSeq = last
      ? parseInt(last.admissionNumber.replace(prefix, ''), 10) + 1
      : 1;

    return `${prefix}${String(nextSeq).padStart(5, '0')}`;
  }

  async list(schoolId: string, query: ListStudentsQuery) {
    const { page, limit, search, classId, gender, isAlumni, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.StudentWhereInput = {
      user: { schoolId },
      ...(gender && { gender }),
      ...(isAlumni !== undefined && { isAlumni }),
      ...(classId && {
        enrollments: { some: { classId, isActive: true } },
      }),
      ...(search && {
        OR: [
          { admissionNumber: { contains: search, mode: 'insensitive' } },
          { user: { firstName: { contains: search, mode: 'insensitive' } } },
          { user: { lastName: { contains: search, mode: 'insensitive' } } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
          { user: { phone: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const orderBy: Prisma.StudentOrderByWithRelationInput =
      sortBy === 'firstName' || sortBy === 'lastName'
        ? { user: { [sortBy]: sortOrder } }
        : { [sortBy]: sortOrder };

    const [students, total] = await prisma.$transaction([
      prisma.student.findMany({ where, select: studentSelect, orderBy, skip, take: limit }),
      prisma.student.count({ where }),
    ]);

    return { students, meta: paginate(page, limit, total) };
  }

  async findById(id: string, schoolId: string) {
    const cacheKey = `student:${id}`;
    const cached = await cache.get<object>(cacheKey);
    if (cached) return cached;

    const student = await prisma.student.findFirst({
      where: { id, user: { schoolId } },
      select: studentSelect,
    });
    if (!student) throw new AppError('Student not found', 404);

    await cache.set(cacheKey, student, 300); // 5-min cache
    return student;
  }

  async create(schoolId: string, data: CreateStudentInput) {
    const admissionNumber = await this.generateAdmissionNumber(schoolId);
    const password = data.password || admissionNumber; // default password = admission number
    const hashedPassword = await bcrypt.hash(password, 12);

    const student = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          schoolId,
          email: data.email,
          password: hashedPassword,
          role: UserRole.STUDENT,
          firstName: data.firstName,
          lastName: data.lastName,
          middleName: data.middleName,
          phone: data.phone,
        },
      });

      const newStudent = await tx.student.create({
        data: {
          userId: user.id,
          admissionNumber,
          gender: data.gender,
          dateOfBirth: new Date(data.dateOfBirth),
          bloodGroup: data.bloodGroup,
          nationality: data.nationality,
          religion: data.religion,
          address: data.address,
          city: data.city,
          state: data.state,
          country: data.country,
          postalCode: data.postalCode,
          admissionDate: data.admissionDate ? new Date(data.admissionDate) : new Date(),
          previousSchool: data.previousSchool,
          medicalConditions: data.medicalConditions,
          allergies: data.allergies,
          emergencyContact: data.emergencyContact,
          emergencyPhone: data.emergencyPhone,
          emergencyRelation: data.emergencyRelation,
        },
      });

      // Enroll in class
      await tx.enrollment.create({
        data: { studentId: newStudent.id, classId: data.classId },
      });

      return newStudent;
    });

    return this.findById(student.id, schoolId);
  }

  async update(id: string, schoolId: string, data: Partial<CreateStudentInput>) {
    const existing = await prisma.student.findFirst({
      where: { id, user: { schoolId } },
    });
    if (!existing) throw new AppError('Student not found', 404);

    const { email, firstName, lastName, middleName, phone, classId, password, ...studentData } = data;

    await prisma.$transaction(async (tx) => {
      const userUpdate: Prisma.UserUpdateInput = {};
      if (email) userUpdate.email = email;
      if (firstName) userUpdate.firstName = firstName;
      if (lastName) userUpdate.lastName = lastName;
      if (middleName !== undefined) userUpdate.middleName = middleName;
      if (phone !== undefined) userUpdate.phone = phone;
      if (password) userUpdate.password = await bcrypt.hash(password, 12);

      if (Object.keys(userUpdate).length > 0) {
        await tx.user.update({ where: { id: existing.userId }, data: userUpdate });
      }

      const studentUpdate: Prisma.StudentUpdateInput = {};
      if (studentData.gender) studentUpdate.gender = studentData.gender;
      if (studentData.dateOfBirth) studentUpdate.dateOfBirth = new Date(studentData.dateOfBirth);
      if (studentData.bloodGroup) studentUpdate.bloodGroup = studentData.bloodGroup;
      if (studentData.address !== undefined) studentUpdate.address = studentData.address;
      // ... map remaining fields

      if (Object.keys(studentUpdate).length > 0) {
        await tx.student.update({ where: { id }, data: studentUpdate });
      }

      if (classId) {
        // Deactivate current enrollment and create new one
        await tx.enrollment.updateMany({
          where: { studentId: id, isActive: true },
          data: { isActive: false },
        });
        await tx.enrollment.create({ data: { studentId: id, classId } });
      }
    });

    await cache.del(`student:${id}`);
    return this.findById(id, schoolId);
  }

  async delete(id: string, schoolId: string): Promise<void> {
    const student = await prisma.student.findFirst({
      where: { id, user: { schoolId } },
      select: { userId: true },
    });
    if (!student) throw new AppError('Student not found', 404);

    // Deleting User cascades to Student via onDelete: Cascade
    await prisma.user.delete({ where: { id: student.userId } });
    await cache.del(`student:${id}`);
  }

  async getDashboardStats(schoolId: string) {
    const cacheKey = `stats:students:${schoolId}`;
    const cached = await cache.get<object>(cacheKey);
    if (cached) return cached;

    const [total, active, alumni, genderBreakdown, recentAdmissions] = await Promise.all([
      prisma.student.count({ where: { user: { schoolId } } }),
      prisma.student.count({ where: { user: { schoolId, isActive: true }, isAlumni: false } }),
      prisma.student.count({ where: { user: { schoolId }, isAlumni: true } }),
      prisma.student.groupBy({
        by: ['gender'],
        where: { user: { schoolId } },
        _count: true,
      }),
      prisma.student.findMany({
        where: { user: { schoolId } },
        select: { admissionNumber: true, admissionDate: true, user: { select: { firstName: true, lastName: true } } },
        orderBy: { admissionDate: 'desc' },
        take: 5,
      }),
    ]);

    const stats = { total, active, alumni, genderBreakdown, recentAdmissions };
    await cache.set(cacheKey, stats, 60);
    return stats;
  }
}

export const studentService = new StudentService();

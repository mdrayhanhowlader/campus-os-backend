/**
 * Prisma seed — creates a demo school with Super Admin, Admin,
 * Teacher, Student, and Parent accounts so you can log in immediately.
 *
 * Run:  npx ts-node src/config/seed.ts
 */

import { PrismaClient, UserRole, Gender, BloodGroup } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding CampusOS database...');

  // ─── School ────────────────────────────────────────────────
  const school = await prisma.school.upsert({
    where: { code: 'RIVERSIDE-HS' },
    update: {},
    create: {
      name: 'Riverside High School',
      shortName: 'RHS',
      code: 'RIVERSIDE-HS',
      address: '123 Education Ave',
      city: 'Springfield',
      state: 'IL',
      country: 'USA',
      postalCode: '62701',
      phone: '+1-217-555-0100',
      email: 'info@riverside.edu',
      website: 'https://riverside.edu',
      timezone: 'America/Chicago',
      currency: 'USD',
      currencySymbol: '$',
    },
  });
  console.log('✅ School created:', school.code);

  // ─── Academic Year ─────────────────────────────────────────
  const academicYear = await prisma.academicYear.upsert({
    where: { schoolId_name: { schoolId: school.id, name: '2025-2026' } },
    update: {},
    create: {
      schoolId: school.id,
      name: '2025-2026',
      startDate: new Date('2025-09-01'),
      endDate: new Date('2026-06-30'),
      isActive: true,
      isCurrent: true,
    },
  });
  console.log('✅ Academic year created:', academicYear.name);

  // ─── Helper: hash password ─────────────────────────────────
  const hash = (p: string) => bcrypt.hash(p, 12);

  // ─── Users ─────────────────────────────────────────────────
  const users: { role: UserRole; email: string; firstName: string; lastName: string; password: string }[] = [
    { role: UserRole.SUPER_ADMIN,  email: 'superadmin@campusos.com',   firstName: 'System',   lastName: 'Administrator', password: 'admin' },
    { role: UserRole.SCHOOL_ADMIN, email: 'admin@riverside.edu',       firstName: 'Patricia', lastName: 'Wilson',        password: 'password' },
    { role: UserRole.TEACHER,      email: 'teacher@riverside.edu',     firstName: 'Michael',  lastName: 'Torres',        password: 'password' },
    { role: UserRole.STUDENT,      email: 'student@riverside.edu',     firstName: 'Emma',     lastName: 'Rodriguez',     password: 'password' },
    { role: UserRole.PARENT,       email: 'parent@riverside.edu',      firstName: 'Carlos',   lastName: 'Rodriguez',     password: 'password' },
    { role: UserRole.ACCOUNTANT,   email: 'accountant@riverside.edu',  firstName: 'Sandra',   lastName: 'Kim',           password: 'password' },
    { role: UserRole.LIBRARIAN,    email: 'librarian@riverside.edu',   firstName: 'James',    lastName: 'Park',          password: 'password' },
  ];

  const createdUsers = await Promise.all(
    users.map(async (u) => {
      const user = await prisma.user.upsert({
        where: { schoolId_email: { schoolId: school.id, email: u.email } },
        update: { password: await hash(u.password) },
        create: {
          schoolId: school.id,
          email: u.email,
          password: await hash(u.password),
          role: u.role,
          firstName: u.firstName,
          lastName: u.lastName,
          isActive: true,
          isVerified: true,
        },
      });
      return { ...user, plainPassword: u.password };
    })
  );

  const [superAdmin, admin, teacher, studentUser, parentUser] = createdUsers;
  console.log('✅ Users created:', createdUsers.map((u) => `${u.role}:${u.email}`).join(', '));

  // ─── Staff (Teacher) ───────────────────────────────────────
  const staff = await prisma.staff.upsert({
    where: { userId: teacher.id },
    update: {},
    create: {
      userId: teacher.id,
      employeeId: 'EMP-2024-001',
      designation: 'Mathematics Teacher',
      gender: Gender.MALE,
      joiningDate: new Date('2020-09-01'),
      salary: 65000,
    },
  });

  // ─── Class ─────────────────────────────────────────────────
  const cls = await prisma.class.upsert({
    where: { schoolId_academicYearId_grade_section: {
      schoolId: school.id, academicYearId: academicYear.id, grade: 10, section: 'A'
    }},
    update: {},
    create: {
      schoolId: school.id,
      academicYearId: academicYear.id,
      name: 'Grade 10',
      grade: 10,
      section: 'A',
      capacity: 30,
    },
  });

  // ─── Student ───────────────────────────────────────────────
  const student = await prisma.student.upsert({
    where: { userId: studentUser.id },
    update: {},
    create: {
      userId: studentUser.id,
      admissionNumber: 'STU-2025-00001',
      gender: Gender.FEMALE,
      dateOfBirth: new Date('2008-05-15'),
      bloodGroup: BloodGroup.A_POSITIVE,
      emergencyContact: 'Carlos Rodriguez',
      emergencyPhone: '+1-217-555-0200',
      emergencyRelation: 'Father',
    },
  });

  // Enroll student
  await prisma.enrollment.upsert({
    where: { studentId_classId: { studentId: student.id, classId: cls.id } },
    update: {},
    create: { studentId: student.id, classId: cls.id, isActive: true },
  });

  // ─── Parent ────────────────────────────────────────────────
  const parent = await prisma.parent.upsert({
    where: { userId: parentUser.id },
    update: {},
    create: { userId: parentUser.id, gender: Gender.MALE, occupation: 'Engineer' },
  });

  await prisma.studentParent.upsert({
    where: { studentId_parentId: { studentId: student.id, parentId: parent.id } },
    update: {},
    create: { studentId: student.id, parentId: parent.id, relation: 'Father', isPrimary: true },
  });

  console.log('✅ Student, parent, and enrollment created');

  // ─── Fee Category & Invoice ────────────────────────────────
  const feeCategory = await prisma.feeCategory.upsert({
    where: { schoolId_code: { schoolId: school.id, code: 'TUITION' } },
    update: {},
    create: { schoolId: school.id, name: 'Tuition Fee', code: 'TUITION', isRecurring: true },
  });

  const invoice = await prisma.feeInvoice.create({
    data: {
      invoiceNumber: 'INV-202601-0001',
      studentId: student.id,
      academicYearId: academicYear.id,
      dueDate: new Date('2026-01-31'),
      totalAmount: 1200,
      discountAmount: 0,
      balanceAmount: 1200,
      paidAmount: 0,
      items: {
        create: [{
          feeCategoryId: feeCategory.id,
          description: 'Tuition Fee — Term 1 2025-2026',
          amount: 1200,
          discount: 0,
          netAmount: 1200,
        }],
      },
    },
  }).catch(() => null); // Ignore if already exists

  console.log('✅ Fee category and invoice created');

  // ─── Summary ───────────────────────────────────────────────
  console.log('\n════════════════════════════════════════');
  console.log('🎓 CampusOS seed complete!');
  console.log('════════════════════════════════════════');
  console.log('School Code : RIVERSIDE-HS');
  console.log('\nLogin credentials:');
  createdUsers.forEach((u) => {
    console.log(`  [${u.role.padEnd(14)}] ${u.email.padEnd(35)} / ${u.plainPassword}`);
  });
  console.log('════════════════════════════════════════\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

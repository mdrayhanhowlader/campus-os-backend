-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('TRIAL', 'STARTER', 'STANDARD', 'PREMIUM', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ModuleKey" AS ENUM ('TEACHER_PORTAL', 'STUDENT_PORTAL', 'PARENT_PORTAL', 'ACCOUNTANT_PORTAL', 'LIBRARIAN_PORTAL', 'TRANSPORT_MODULE', 'HOSTEL_MODULE', 'EXAM_MODULE', 'SYLLABUS_MODULE', 'PAYROLL_MODULE', 'ONLINE_FEE_PAYMENT', 'MESSAGING', 'ANNOUNCEMENTS', 'REPORT_CARDS', 'HALL_TICKETS');

-- CreateTable
CREATE TABLE "SchoolSubscription" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL DEFAULT 'TRIAL',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "maxStudents" INTEGER NOT NULL DEFAULT 200,
    "maxStaff" INTEGER NOT NULL DEFAULT 30,
    "billingEmail" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "renewsAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolModule" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "key" "ModuleKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolSubscription_schoolId_key" ON "SchoolSubscription"("schoolId");

-- CreateIndex
CREATE INDEX "SchoolModule_subscriptionId_enabled_idx" ON "SchoolModule"("subscriptionId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolModule_subscriptionId_key_key" ON "SchoolModule"("subscriptionId", "key");

-- AddForeignKey
ALTER TABLE "SchoolSubscription" ADD CONSTRAINT "SchoolSubscription_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolModule" ADD CONSTRAINT "SchoolModule_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "SchoolSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

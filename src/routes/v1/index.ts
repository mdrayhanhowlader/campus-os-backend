import { Router } from 'express';
import authRoutes from './auth.routes';
import studentRoutes from './students.routes';
import attendanceRoutes from './attendance.routes';
import feeRoutes from './fees.routes';
import examRoutes from './exams.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/students', studentRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/fees', feeRoutes);
router.use('/exams', examRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'CampusOS API is running',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
  });
});

export default router;

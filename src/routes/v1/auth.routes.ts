import { Router } from 'express';
import { authController } from '../../controllers/auth/auth.controller';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import {
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../../validators/auth/auth.validator';
import rateLimit from 'express-rate-limit';

const router = Router();

// Strict rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', authLimiter, validate(loginSchema), authController.login.bind(authController));
router.post('/refresh', validate(refreshTokenSchema), authController.refresh.bind(authController));
router.post('/logout', authenticate as any, authController.logout.bind(authController));
router.post('/logout-all', authenticate as any, authController.logoutAll.bind(authController));
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword.bind(authController));
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), authController.resetPassword.bind(authController));
router.get('/me', authenticate as any, authController.me.bind(authController));

export default router;

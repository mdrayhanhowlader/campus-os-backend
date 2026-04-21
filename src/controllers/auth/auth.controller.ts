import { Request, Response } from 'express';
import { authService } from '../../services/auth/auth.service';
import { sendSuccess, sendCreated } from '../../utils/response';
import { AuthenticatedRequest } from '../../types';

export class AuthController {
  async login(req: Request, res: Response): Promise<void> {
    const { email, password, schoolCode } = req.body;
    const result = await authService.login(email, password, schoolCode, req.ip);

    // Set refresh token as HttpOnly cookie (additional security layer)
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    sendSuccess(res, { accessToken: result.accessToken, user: result.user }, 'Login successful');
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const token = req.body.refreshToken || req.cookies?.refreshToken;
    const tokens = await authService.refreshTokens(token);

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    sendSuccess(res, { accessToken: tokens.accessToken }, 'Token refreshed');
  }

  async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
    const accessToken = req.headers.authorization!.slice(7);
    const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
    await authService.logout(req.user.id, accessToken, refreshToken);
    res.clearCookie('refreshToken');
    sendSuccess(res, null, 'Logged out successfully');
  }

  async logoutAll(req: AuthenticatedRequest, res: Response): Promise<void> {
    const accessToken = req.headers.authorization!.slice(7);
    await authService.logoutAll(req.user.id, accessToken);
    res.clearCookie('refreshToken');
    sendSuccess(res, null, 'Logged out from all devices');
  }

  async forgotPassword(req: Request, res: Response): Promise<void> {
    await authService.forgotPassword(req.body.email, req.body.schoolCode);
    // Always respond the same to prevent email enumeration
    sendSuccess(res, null, 'If an account exists, a reset link has been sent');
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    await authService.resetPassword(req.body.token, req.body.password);
    sendSuccess(res, null, 'Password reset successful. Please log in.');
  }

  async me(req: AuthenticatedRequest, res: Response): Promise<void> {
    sendSuccess(res, req.user, 'Profile fetched');
  }
}

export const authController = new AuthController();

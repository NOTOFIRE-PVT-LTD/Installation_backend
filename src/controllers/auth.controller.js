const authService = require('../services/auth.service');
const userService = require('../services/user.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { setRefreshTokenCookie, clearRefreshTokenCookie } = require('../utils/cookies');
const env = require('../config/env');

function getMeta(req) {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login({ email, password }, getMeta(req));
  setRefreshTokenCookie(res, result.refreshToken);
  sendSuccess(res, {
    message: 'Login successful',
    data: { user: result.user, permissions: result.permissions, accessToken: result.accessToken },
  });
});

const refresh = asyncHandler(async (req, res) => {
  const rawRefreshToken = req.cookies[env.cookie.refreshTokenName];
  const result = await authService.refresh(rawRefreshToken, getMeta(req));
  setRefreshTokenCookie(res, result.refreshToken);
  sendSuccess(res, {
    message: 'Token refreshed',
    data: { user: result.user, permissions: result.permissions, accessToken: result.accessToken },
  });
});

const logout = asyncHandler(async (req, res) => {
  const rawRefreshToken = req.cookies[env.cookie.refreshTokenName];
  await authService.logout(rawRefreshToken);
  clearRefreshTokenCookie(res);
  sendSuccess(res, { message: 'Logged out successfully' });
});

const me = asyncHandler(async (req, res) => {
  const result = await authService.getMe(req.user._id);
  sendSuccess(res, { message: 'OK', data: result });
});

const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  sendSuccess(res, {
    message: 'If an account with that email exists, a password reset link has been sent.',
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.params.token, req.body.password);
  sendSuccess(res, { message: 'Password has been reset successfully. Please log in.' });
});

const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user._id, req.body.currentPassword, req.body.newPassword);
  sendSuccess(res, { message: 'Password changed successfully' });
});

const updateProfile = asyncHandler(async (req, res) => {
  const user = await userService.updateOwnProfile(req.user._id, req.body, req.file);
  sendSuccess(res, { message: 'Profile updated', data: user });
});

module.exports = { login, refresh, logout, me, forgotPassword, resetPassword, changePassword, updateProfile };

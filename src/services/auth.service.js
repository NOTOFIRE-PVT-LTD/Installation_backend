const userRepository = require('../repositories/user.repository');
const refreshTokenRepository = require('../repositories/refreshToken.repository');
const tokenService = require('./token.service');
const emailService = require('./email.service');
const permissionService = require('./permission.service');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const { USER_STATUS } = require('../config/constants');

async function issueTokenPair(user, meta = {}) {
  const accessToken = tokenService.signAccessToken(user);
  const { token: refreshToken } = tokenService.signRefreshToken(user);
  const tokenHash = tokenService.hashToken(refreshToken);

  await refreshTokenRepository.create({
    user: user._id,
    tokenHash,
    expiresAt: tokenService.refreshTokenExpiryDate(),
    userAgent: meta.userAgent || null,
    ip: meta.ip || null,
  });

  return { accessToken, refreshToken };
}

async function login({ email, password }, meta) {
  const user = await userRepository.findByEmailWithPassword(email);
  if (!user) throw new ApiError(401, 'Invalid email or password');

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw new ApiError(401, 'Invalid email or password');

  if (user.status === USER_STATUS.INACTIVE) {
    throw new ApiError(403, 'Your account has been deactivated. Contact an administrator.');
  }

  const { accessToken, refreshToken } = await issueTokenPair(user, meta);

  return {
    user: user.toSafeObject(),
    permissions: permissionService.serializePermissions(user),
    accessToken,
    refreshToken,
  };
}

async function refresh(rawRefreshToken, meta) {
  if (!rawRefreshToken) throw new ApiError(401, 'Refresh token missing');

  let payload;
  try {
    payload = tokenService.verifyRefreshToken(rawRefreshToken);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const tokenHash = tokenService.hashToken(rawRefreshToken);
  const existing = await refreshTokenRepository.findValidByHash(tokenHash);

  if (!existing) {
    throw new ApiError(401, 'Refresh token not recognized');
  }

  if (existing.revoked) {
    // Reuse of a revoked token - possible theft, revoke all sessions for this user
    await refreshTokenRepository.revokeAllForUser(payload.sub);
    throw new ApiError(401, 'Refresh token has been revoked. Please log in again.');
  }

  if (existing.expiresAt < new Date()) {
    throw new ApiError(401, 'Refresh token has expired. Please log in again.');
  }

  const user = await userRepository.findByIdWithPermissions(payload.sub);
  if (!user) throw new ApiError(401, 'User no longer exists');
  if (user.status === USER_STATUS.INACTIVE) throw new ApiError(403, 'Account deactivated');

  const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(user, meta);
  const newTokenHash = tokenService.hashToken(newRefreshToken);

  existing.revoked = true;
  existing.replacedByTokenHash = newTokenHash;
  await existing.save();

  return {
    user: user.toSafeObject(),
    permissions: permissionService.serializePermissions(user),
    accessToken,
    refreshToken: newRefreshToken,
  };
}

async function logout(rawRefreshToken) {
  if (!rawRefreshToken) return;
  const tokenHash = tokenService.hashToken(rawRefreshToken);
  const existing = await refreshTokenRepository.findValidByHash(tokenHash);
  if (existing && !existing.revoked) {
    existing.revoked = true;
    await existing.save();
  }
}

async function forgotPassword(email) {
  const user = await userRepository.findOne({ email: email.toLowerCase() });
  if (!user) return; // do not reveal whether the email exists

  const rawToken = tokenService.generateRawToken();
  const hashedToken = tokenService.hashToken(rawToken);
  const expires = new Date(Date.now() + env.resetPasswordTokenExpiresMin * 60 * 1000);

  await userRepository.updateById(user._id, {
    resetPasswordToken: hashedToken,
    resetPasswordExpires: expires,
  });

  await emailService.sendResetPasswordEmail(user, rawToken);
}

async function resetPassword(rawToken, newPassword) {
  const hashedToken = tokenService.hashToken(rawToken);
  const user = await userRepository.findByResetToken(hashedToken);
  if (!user) throw new ApiError(400, 'Reset token is invalid or has expired');

  user.password = newPassword;
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;
  await user.save();

  await refreshTokenRepository.revokeAllForUser(user._id);
  await emailService.sendPasswordChangedEmail(user);
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await userRepository.findByIdWithPassword(userId);
  if (!user) throw new ApiError(404, 'User not found');

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw new ApiError(400, 'Current password is incorrect');

  user.password = newPassword;
  await user.save();

  await refreshTokenRepository.revokeAllForUser(user._id);
  await emailService.sendPasswordChangedEmail(user);
}

async function getMe(userId) {
  const user = await userRepository.findByIdWithPermissions(userId);
  if (!user) throw new ApiError(404, 'User not found');
  return {
    user: user.toSafeObject(),
    permissions: permissionService.serializePermissions(user),
  };
}

module.exports = {
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
};

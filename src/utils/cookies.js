const env = require('../config/env');
const ms = require('./ms');

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    maxAge: ms(env.jwt.refreshExpiresIn),
    path: '/api/auth',
  };
}

function setRefreshTokenCookie(res, token) {
  res.cookie(env.cookie.refreshTokenName, token, refreshCookieOptions());
}

function clearRefreshTokenCookie(res) {
  res.clearCookie(env.cookie.refreshTokenName, refreshCookieOptions());
}

module.exports = { setRefreshTokenCookie, clearRefreshTokenCookie };

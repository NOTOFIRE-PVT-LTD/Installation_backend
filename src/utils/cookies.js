const env = require('../config/env');
const ms = require('./ms');

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    maxAge: ms(env.jwt.refreshExpiresIn),
    // Browser path must match the public API prefix (e.g. /ws-api/auth on EC2).
    path: env.cookie.path,
  };
}

function setRefreshTokenCookie(res, token) {
  res.cookie(env.cookie.refreshTokenName, token, refreshCookieOptions());
}

function clearRefreshTokenCookie(res) {
  res.clearCookie(env.cookie.refreshTokenName, refreshCookieOptions());
}

module.exports = { setRefreshTokenCookie, clearRefreshTokenCookie };

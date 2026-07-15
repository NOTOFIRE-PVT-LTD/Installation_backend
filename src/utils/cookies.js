const env = require('../config/env');
const ms = require('./ms');

function setRefreshTokenCookie(res, token) {
  res.cookie(env.cookie.refreshTokenName, token, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    maxAge: ms(env.jwt.refreshExpiresIn),
    path: '/api/auth',
  });
}

function clearRefreshTokenCookie(res) {
  res.clearCookie(env.cookie.refreshTokenName, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/api/auth',
  });
}

module.exports = { setRefreshTokenCookie, clearRefreshTokenCookie };

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const ms = require('../utils/ms');
const env = require('../config/env');

function signAccessToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
  });
}

function signRefreshToken(user) {
  const jti = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign({ sub: user._id.toString(), jti }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  });
  return { token, jti };
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

function refreshTokenExpiryDate() {
  return new Date(Date.now() + ms(env.jwt.refreshExpiresIn));
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  generateRawToken,
  refreshTokenExpiryDate,
};

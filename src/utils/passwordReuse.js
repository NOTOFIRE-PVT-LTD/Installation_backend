const ApiError = require('./ApiError');

const REUSED_PASSWORD_MESSAGE = 'Try a different password. This was used previously.';

async function rejectIfPasswordReused(user, newPassword) {
  if (!user || !newPassword || typeof user.comparePassword !== 'function') return;
  const reused = await user.comparePassword(newPassword);
  if (reused) throw new ApiError(400, REUSED_PASSWORD_MESSAGE);
}

module.exports = { rejectIfPasswordReused, REUSED_PASSWORD_MESSAGE };

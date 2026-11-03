const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { rejectIfPasswordReused, REUSED_PASSWORD_MESSAGE } = require('./passwordReuse');

describe('rejectIfPasswordReused', () => {
  test('throws when the new password matches the current hash', async () => {
    const user = { comparePassword: async (candidate) => candidate === 'OldPass123' };
    await assert.rejects(
      () => rejectIfPasswordReused(user, 'OldPass123'),
      (err) => err.statusCode === 400 && err.message === REUSED_PASSWORD_MESSAGE
    );
  });

  test('allows a different password', async () => {
    const user = { comparePassword: async (candidate) => candidate === 'OldPass123' };
    await assert.doesNotReject(() => rejectIfPasswordReused(user, 'NewPass123'));
  });
});

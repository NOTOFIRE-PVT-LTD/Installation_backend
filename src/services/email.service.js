const transporter = require('../config/mailer');
const env = require('../config/env');
const logger = require('../utils/logger');

async function sendMail({ to, subject, html }) {
  try {
    await transporter.sendMail({
      from: `"${env.smtp.fromName}" <${env.smtp.fromEmail}>`,
      to,
      subject,
      html,
    });
  } catch (err) {
    logger.error('[email] Failed to send email:', err.message);
  }
}

function sendResetPasswordEmail(user, rawToken) {
  const link = `${env.clientUrl}/reset-password/${rawToken}`;
  return sendMail({
    to: user.email,
    subject: 'Reset your password',
    html: `
      <p>Hi ${user.name},</p>
      <p>We received a request to reset your password. Click the link below to set a new password. This link expires in ${env.resetPasswordTokenExpiresMin} minutes.</p>
      <p><a href="${link}">${link}</a></p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  });
}

function sendPasswordChangedEmail(user) {
  return sendMail({
    to: user.email,
    subject: 'Your password has been changed',
    html: `<p>Hi ${user.name},</p><p>This is a confirmation that your password was just changed. If you did not do this, contact your administrator immediately.</p>`,
  });
}

function sendWelcomeEmail(user, temporaryPassword) {
  return sendMail({
    to: user.email,
    subject: 'Your NF Site Installation Report account',
    html: `
      <p>Hi ${user.name},</p>
      <p>An account has been created for you on NF Site Installation Report.</p>
      <p>Email: ${user.email}</p>
      ${temporaryPassword ? `<p>Temporary password: ${temporaryPassword}</p>` : ''}
      <p>Please log in and change your password as soon as possible.</p>
    `,
  });
}

module.exports = { sendResetPasswordEmail, sendPasswordChangedEmail, sendWelcomeEmail };

const transporter = require('../config/mailer');
const env = require('../config/env');
const logger = require('../utils/logger');

async function sendMail({ to, subject, html }) {
  try {
    const info = await transporter.sendMail({
      from: `"${env.smtp.fromName}" <${env.smtp.fromEmail}>`,
      to,
      subject,
      html,
    });
    return info;
  } catch (err) {
    logger.error('[email] Failed to send email:', err.message);
    throw err;
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


async function sendTicketCreatedEmail({
  ticketNumber,
  customerEmail,
  customerName,
  productName,
  subject,
  priority = 'MEDIUM',
  createdAt = new Date(),
}) {
  if (!customerEmail) return;
  const clientUrl = env.clientUrl || 'http://localhost:5173';
  const trackingUrl = `${clientUrl}/support/track?ticket=${encodeURIComponent(ticketNumber)}`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #241404; max-width: 600px; margin: 0 auto; border: 1px solid #D4A34E; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(90deg, #E5B85C 0%, #C99846 30%, #8C591D 70%, #543310 100%); padding: 20px; color: #FFFFFF; text-align: center;">
        <h2 style="margin: 0; font-size: 20px; letter-spacing: 0.05em;">VALUECON SERVICE SUPPORT</h2>
        <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Complaint Registered Successfully</p>
      </div>
      <div style="padding: 24px; background: #FFFDF8;">
        <p>Dear <strong>${customerName || 'Customer'}</strong>,</p>
        <p>Your service complaint has been registered with unique Ticket ID: <span style="display: inline-block; background: #FAE2B4; color: #241404; font-weight: 800; padding: 4px 10px; border-radius: 6px; font-size: 15px; border: 1px solid #C99846;">${ticketNumber}</span></p>
        
        <div style="background: #FDF7EB; border-left: 4px solid #C99846; padding: 14px; margin: 18px 0; border-radius: 6px;">
          <p style="margin: 0 0 6px;"><strong>Equipment / Product:</strong> ${productName || 'N/A'}</p>
          <p style="margin: 0 0 6px;"><strong>Subject:</strong> ${subject || 'N/A'}</p>
          <p style="margin: 0 0 6px;"><strong>Priority:</strong> ${priority}</p>
          <p style="margin: 0;"><strong>Logged At:</strong> ${new Date(createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
        </div>

        <p>You can check real-time investigation updates, engineer assignment, and warranty status at any time:</p>
        <p style="text-align: center; margin: 25px 0;">
          <a href="${trackingUrl}" style="display: inline-block; background: linear-gradient(90deg, #FAE2B4 0%, #E5B85C 25%, #C99846 60%, #7D511E 85%, #38200A 100%); color: #241404; font-weight: 800; padding: 12px 28px; text-decoration: none; border-radius: 999px; box-shadow: 0 4px 12px rgba(32, 18, 4, 0.25);">Track Complaint Status</a>
        </p>

        <p style="font-size: 12px; color: #7D511E;">Direct link:<br/><a href="${trackingUrl}" style="color: #8C591D;">${trackingUrl}</a></p>

        <hr style="border: none; border-top: 1px solid #E2D3BE; margin: 20px 0;" />
        <p style="margin: 0; font-size: 12px; color: #8C591D;">Best regards,<br/><strong>Valuecon Customer Support Team</strong></p>
      </div>
    </div>
  `;

  return sendMail({
    to: customerEmail,
    subject: `Complaint Registered: ${ticketNumber} - ${subject || 'Service Support'}`,
    html,
  });
}

async function sendTicketResolvedEmail({
  ticketNumber,
  customerEmail,
  customerName,
  productName,
  subject,
  resolutionSummary,
  resolutionDate = new Date(),
}) {
  const clientUrl = env.clientUrl || 'http://localhost:5173';
  const trackingUrl = `${clientUrl}/support/track?ticket=${encodeURIComponent(ticketNumber)}`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #0f766e;">Service Complaint Resolved</h2>
      <p>Dear ${customerName || 'Customer'},</p>
      <p>Your service complaint <strong>${ticketNumber}</strong> regarding "<strong>${productName || 'Product'}</strong>" has been marked as <strong>RESOLVED</strong>.</p>
      <div style="background: #f8fafc; border-left: 4px solid #0f766e; padding: 12px; margin: 16px 0;">
        <p style="margin: 0 0 8px;"><strong>Complaint Subject:</strong> ${subject || 'N/A'}</p>
        <p style="margin: 0 0 8px;"><strong>Resolution Summary:</strong> ${resolutionSummary}</p>
        <p style="margin: 0;"><strong>Resolution Date:</strong> ${new Date(resolutionDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
      </div>
      <p>You can view the full live tracking status and customer updates here:</p>
      <p><a href="${trackingUrl}" style="display: inline-block; background: #0f766e; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Track Your Complaint</a></p>
      <p>If you have any further questions or if the issue persists, please feel free to reach out to our service support desk.</p>
      <p>Best regards,<br/><strong>Customer Service & Support Team</strong></p>
    </div>
  `;

  return sendMail({
    to: customerEmail,
    subject: `Complaint Resolved: ${ticketNumber} - ${subject || 'Equipment Service'}`,
    html,
  });
}

module.exports = {
  sendResetPasswordEmail,
  sendPasswordChangedEmail,
  sendWelcomeEmail,
  sendTicketCreatedEmail,
  sendTicketResolvedEmail,
};

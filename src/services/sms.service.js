const env = require('../config/env');
const logger = require('../utils/logger');
const { formatDestination } = require('./aisensy.service');

/**
 * Optional SMS via MSG91 (or any HTTP endpoint). Skips if not configured.
 * shortcut: only MSG91 flow API; plug another vendor when needed.
 */
async function sendSms({ mobileNumber, message }) {
  if (!env.sms?.enabled) {
    return { skipped: true, reason: 'SMS is disabled' };
  }
  if (!env.sms.authKey || !env.sms.senderId) {
    return { skipped: true, reason: 'SMS_AUTH_KEY / SMS_SENDER_ID not set' };
  }

  const destination = formatDestination(mobileNumber);
  if (!destination) throw new Error('Invalid mobile number for SMS');

  const url = env.sms.apiUrl || 'https://control.msg91.com/api/v5/flow/';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authkey: env.sms.authKey,
    },
    body: JSON.stringify({
      template_id: env.sms.templateId || undefined,
      short_url: '0',
      recipients: [
        {
          mobiles: destination,
          message: String(message || '').slice(0, 1000),
          VAR1: message,
        },
      ],
      sender: env.sms.senderId,
      message: String(message || '').slice(0, 1000),
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    logger.error('[sms] Send failed:', text);
    throw new Error(text || `SMS failed (${response.status})`);
  }
  return { ok: true, raw: text };
}

module.exports = { sendSms };

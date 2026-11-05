const env = require('../config/env');
const logger = require('../utils/logger');
const { formatDestination } = require('./aisensy.service');

/**
 * Optional SMS via MSG91.
 * - With SMS_TEMPLATE_ID → Flow (DLT template) API
 * - Without template → plain transactional text API
 * Off unless SMS_ENABLED=true and auth key + sender are set.
 */
async function sendSms({ mobileNumber, message }) {
  if (!env.sms?.enabled) {
    return { skipped: true, reason: 'SMS is disabled (set SMS_ENABLED=true)' };
  }
  if (!env.sms.authKey || !env.sms.senderId) {
    return { skipped: true, reason: 'SMS_AUTH_KEY / SMS_SENDER_ID not set' };
  }

  const destination = formatDestination(mobileNumber);
  if (!destination) throw new Error('Invalid mobile number for SMS');

  const text = String(message || '').slice(0, 1000);

  if (env.sms.templateId) {
    const url = env.sms.apiUrl || 'https://control.msg91.com/api/v5/flow/';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: env.sms.authKey,
      },
      body: JSON.stringify({
        template_id: env.sms.templateId,
        short_url: '0',
        recipients: [
          {
            mobiles: destination,
            // Common MSG91 flow vars — map in MSG91 dashboard if your template differs
            var: text,
            VAR1: text,
            message: text,
          },
        ],
        sender: env.sms.senderId,
      }),
    });
    const body = await response.text();
    if (!response.ok) {
      logger.error('[sms] Flow send failed:', body);
      throw new Error(body || `SMS failed (${response.status})`);
    }
    return { ok: true, raw: body, mode: 'flow' };
  }

  // Plain SMS (no DLT template id) — MSG91 sendhttp
  const url =
    env.sms.apiUrl ||
    `https://api.msg91.com/api/sendhttp.php?authkey=${encodeURIComponent(env.sms.authKey)}` +
      `&mobiles=${encodeURIComponent(destination)}` +
      `&message=${encodeURIComponent(text)}` +
      `&sender=${encodeURIComponent(env.sms.senderId)}` +
      `&route=4&country=91`;

  const response = await fetch(url, { method: 'GET' });
  const body = await response.text();
  // MSG91 returns a request id string on success; errors often start with error text
  if (!response.ok || /^(error|invalid|missing)/i.test(String(body).trim())) {
    logger.error('[sms] Text send failed:', body);
    throw new Error(body || `SMS failed (${response.status})`);
  }
  return { ok: true, raw: body, mode: 'text' };
}

module.exports = { sendSms };

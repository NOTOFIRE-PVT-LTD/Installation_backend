const env = require('../config/env');
const logger = require('../utils/logger');
const aisensyService = require('./aisensy.service');
const smsService = require('./sms.service');

function trackUrl(ticketNo) {
  const base = String(env.clientUrl || env.clientUrls?.[0] || process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');
  return `${base}/track?ticket=${encodeURIComponent(ticketNo || '')}`;
}

function normalizeChannel(value) {
  const v = String(value || 'whatsapp').toLowerCase();
  if (v === 'sms' || v === 'both') return v;
  return 'whatsapp';
}

function createdSmsBody(complaint) {
  return `Valuecon: Complaint ${complaint.ticketNo} registered. Track: ${trackUrl(complaint.ticketNo)}`;
}

function resolvedSmsBody(complaint) {
  return `Valuecon: Complaint ${complaint.ticketNo} is resolved. Thank you.`;
}

function assignedSmsBody(complaint, engineerName) {
  return `Valuecon: Complaint ${complaint.ticketNo} assigned to ${engineerName || 'our engineer'}. Track: ${trackUrl(complaint.ticketNo)}`;
}

async function pushSmsLog(logs, { phone, ticketNo, kind, message, now }) {
  try {
    const result = await smsService.sendSms({ mobileNumber: phone, message });
    logs.push({
      recipient: phone,
      subject: `${kind} SMS ${ticketNo}`,
      emailType: `SMS_${kind}`,
      status: result?.skipped ? 'SKIPPED' : 'SENT',
      errorMessage: result?.skipped ? result.reason : '',
      sentAt: now,
    });
    return !result?.skipped;
  } catch (err) {
    logger.warn(`[complaintNotify] SMS ${kind} failed:`, err.message);
    logs.push({
      recipient: phone,
      subject: `${kind} SMS ${ticketNo}`,
      emailType: `SMS_${kind}`,
      status: 'FAILED',
      errorMessage: err.message,
      sentAt: now,
    });
    return false;
  }
}

async function sendWhatsAppCreated(complaint) {
  const campaign = env.aisensy.complaintCreatedCampaign;
  const template = env.aisensy.complaintCreatedTemplate || campaign;
  if (!campaign) {
    return { skipped: true, reason: 'AISENSY_COMPLAINT_CREATED_CAMPAIGN not set' };
  }
  return aisensyService.sendCampaignMessage({
    destination: complaint.contactNumber,
    userName: complaint.customerName || 'Customer',
    campaignName: campaign,
    templateName: template,
    // {{1}} name {{2}} ticket {{3}} track — see docs/complaint-notify-templates.md
    templateParams: [
      String(complaint.customerName || 'Customer'),
      String(complaint.ticketNo || ''),
      trackUrl(complaint.ticketNo),
    ],
    source: env.aisensy.source,
    allowEnvMediaFallback: false,
  });
}

async function sendWhatsAppResolved(complaint) {
  const campaign = env.aisensy.complaintResolvedCampaign;
  const template = env.aisensy.complaintResolvedTemplate || campaign;
  if (!campaign) return { skipped: true, reason: 'AISENSY_COMPLAINT_RESOLVED_CAMPAIGN not set' };
  return aisensyService.sendCampaignMessage({
    destination: complaint.contactNumber,
    userName: complaint.customerName || 'Customer',
    campaignName: campaign,
    templateName: template,
    templateParams: [
      String(complaint.customerName || 'Customer'),
      String(complaint.ticketNo || ''),
      String(complaint.resolutionSummary || complaint.resolutionNotes || 'Resolved'),
    ],
    source: env.aisensy.source,
    allowEnvMediaFallback: false,
  });
}

/**
 * Default: WhatsApp first. If WA fails / number not on WhatsApp / campaign missing → SMS.
 * channel: whatsapp (WA→SMS fallback) | sms | both (always both)
 */
async function notifyCustomerTicketCreated(complaint, channel = 'whatsapp') {
  const mode = normalizeChannel(channel || complaint.notifyChannel);
  const phone = complaint.contactNumber;
  const logs = [];
  const now = new Date();
  const ticketNo = complaint.ticketNo;

  if (!phone) {
    return [{ recipient: '', subject: 'none', emailType: 'SKIP', status: 'SKIPPED', errorMessage: 'No mobile', sentAt: now }];
  }

  let waOk = false;
  if (mode === 'whatsapp' || mode === 'both') {
    try {
      const result = await sendWhatsAppCreated(complaint);
      if (result?.skipped) {
        logs.push({
          recipient: phone,
          subject: `REGISTRATION WA ${ticketNo}`,
          emailType: 'WHATSAPP_REGISTRATION',
          status: 'SKIPPED',
          errorMessage: result.reason,
          sentAt: now,
        });
      } else {
        waOk = true;
        logs.push({
          recipient: phone,
          subject: `REGISTRATION WA ${ticketNo}`,
          emailType: 'WHATSAPP_REGISTRATION',
          status: 'SENT',
          sentAt: now,
        });
      }
    } catch (err) {
      logger.warn('[complaintNotify] WhatsApp create failed (will try SMS if needed):', err.message);
      logs.push({
        recipient: phone,
        subject: `REGISTRATION WA ${ticketNo}`,
        emailType: 'WHATSAPP_REGISTRATION',
        status: 'FAILED',
        errorMessage: err.message,
        sentAt: now,
      });
    }
  }

  const needSms = mode === 'sms' || mode === 'both' || (mode === 'whatsapp' && !waOk);
  if (needSms) {
    await pushSmsLog(logs, {
      phone,
      ticketNo,
      kind: 'REGISTRATION',
      message: createdSmsBody(complaint),
      now,
    });
  }

  return logs;
}

async function notifyCustomerTicketResolved(complaint, channel = 'whatsapp') {
  const mode = normalizeChannel(channel || complaint.notifyChannel);
  const phone = complaint.contactNumber;
  const logs = [];
  const now = new Date();
  const ticketNo = complaint.ticketNo;
  if (!phone) return logs;

  let waOk = false;
  if (mode === 'whatsapp' || mode === 'both') {
    try {
      const result = await sendWhatsAppResolved(complaint);
      if (result?.skipped) {
        logs.push({
          recipient: phone,
          subject: `RESOLUTION WA ${ticketNo}`,
          emailType: 'WHATSAPP_RESOLUTION',
          status: 'SKIPPED',
          errorMessage: result.reason,
          sentAt: now,
        });
      } else {
        waOk = true;
        logs.push({
          recipient: phone,
          subject: `RESOLUTION WA ${ticketNo}`,
          emailType: 'WHATSAPP_RESOLUTION',
          status: 'SENT',
          sentAt: now,
        });
      }
    } catch (err) {
      logs.push({
        recipient: phone,
        subject: `RESOLUTION WA ${ticketNo}`,
        emailType: 'WHATSAPP_RESOLUTION',
        status: 'FAILED',
        errorMessage: err.message,
        sentAt: now,
      });
    }
  }

  if (mode === 'sms' || mode === 'both' || (mode === 'whatsapp' && !waOk)) {
    await pushSmsLog(logs, {
      phone,
      ticketNo,
      kind: 'RESOLUTION',
      message: resolvedSmsBody(complaint),
      now,
    });
  }

  return logs;
}

async function notifyCustomerTicketAssigned(complaint, engineerName, channel = 'whatsapp') {
  const mode = normalizeChannel(channel || complaint.notifyChannel);
  const campaign = env.aisensy.complaintAssignedCampaign;
  const template = env.aisensy.complaintAssignedTemplate || campaign;
  const logs = [];
  const now = new Date();
  const phone = complaint.contactNumber;
  const ticketNo = complaint.ticketNo;
  if (!phone) return logs;

  let waOk = false;
  if ((mode === 'whatsapp' || mode === 'both') && campaign) {
    try {
      await aisensyService.sendCampaignMessage({
        destination: phone,
        userName: complaint.customerName || 'Customer',
        campaignName: campaign,
        templateName: template,
        // {{1}} name {{2}} ticket {{3}} engineer {{4}} track
        templateParams: [
          String(complaint.customerName || 'Customer'),
          String(ticketNo || ''),
          String(engineerName || 'Engineer'),
          trackUrl(ticketNo),
        ],
        source: env.aisensy.source,
        allowEnvMediaFallback: false,
      });
      waOk = true;
      logs.push({
        recipient: phone,
        subject: `ASSIGNED WA ${ticketNo}`,
        emailType: 'WHATSAPP_ASSIGNED',
        status: 'SENT',
        sentAt: now,
      });
    } catch (err) {
      logs.push({
        recipient: phone,
        subject: `ASSIGNED WA ${ticketNo}`,
        emailType: 'WHATSAPP_ASSIGNED',
        status: 'FAILED',
        errorMessage: err.message,
        sentAt: now,
      });
    }
  } else if (mode === 'whatsapp' || mode === 'both') {
    logs.push({
      recipient: phone,
      subject: `ASSIGNED WA ${ticketNo}`,
      emailType: 'WHATSAPP_ASSIGNED',
      status: 'SKIPPED',
      errorMessage: 'AISENSY_COMPLAINT_ASSIGNED_CAMPAIGN not set',
      sentAt: now,
    });
  }

  if (mode === 'sms' || mode === 'both' || (mode === 'whatsapp' && !waOk)) {
    await pushSmsLog(logs, {
      phone,
      ticketNo,
      kind: 'ASSIGNED',
      message: assignedSmsBody(complaint, engineerName),
      now,
    });
  }

  return logs;
}

module.exports = {
  notifyCustomerTicketCreated,
  notifyCustomerTicketResolved,
  notifyCustomerTicketAssigned,
  trackUrl,
  normalizeChannel,
};

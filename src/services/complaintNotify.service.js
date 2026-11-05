const env = require('../config/env');
const logger = require('../utils/logger');
const aisensyService = require('./aisensy.service');

function trackUrl(ticketNo) {
  const base = String(env.clientUrl || env.clientUrls?.[0] || process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');
  return `${base}/track?ticket=${encodeURIComponent(ticketNo || '')}`;
}

/** Always WhatsApp — SMS removed from complaint customer updates. */
function normalizeChannel() {
  return 'whatsapp';
}

function notifyPhone(complaint) {
  return String(complaint.whatsappNumber || complaint.contactNumber || '').trim();
}

async function sendWhatsAppCreated(complaint) {
  const campaign = env.aisensy.complaintCreatedCampaign;
  const template = env.aisensy.complaintCreatedTemplate || campaign;
  if (!campaign) {
    return { skipped: true, reason: 'AISENSY_COMPLAINT_CREATED_CAMPAIGN not set' };
  }
  return aisensyService.sendCampaignMessage({
    destination: notifyPhone(complaint),
    userName: complaint.customerName || 'Customer',
    campaignName: campaign,
    templateName: template,
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
    destination: notifyPhone(complaint),
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

async function notifyCustomerTicketCreated(complaint) {
  const phone = notifyPhone(complaint);
  const logs = [];
  const now = new Date();
  const ticketNo = complaint.ticketNo;

  if (!phone) {
    return [
      {
        recipient: '',
        subject: 'none',
        emailType: 'SKIP',
        status: 'SKIPPED',
        errorMessage: 'No WhatsApp number',
        sentAt: now,
      },
    ];
  }

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
      logs.push({
        recipient: phone,
        subject: `REGISTRATION WA ${ticketNo}`,
        emailType: 'WHATSAPP_REGISTRATION',
        status: 'SENT',
        sentAt: now,
      });
    }
  } catch (err) {
    logger.warn('[complaintNotify] WhatsApp create failed:', err.message);
    logs.push({
      recipient: phone,
      subject: `REGISTRATION WA ${ticketNo}`,
      emailType: 'WHATSAPP_REGISTRATION',
      status: 'FAILED',
      errorMessage: err.message,
      sentAt: now,
    });
  }

  return logs;
}

async function notifyCustomerTicketResolved(complaint) {
  const phone = notifyPhone(complaint);
  const logs = [];
  const now = new Date();
  const ticketNo = complaint.ticketNo;
  if (!phone) return logs;

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

  return logs;
}

async function notifyCustomerTicketAssigned(complaint, engineerName) {
  const campaign = env.aisensy.complaintAssignedCampaign;
  const template = env.aisensy.complaintAssignedTemplate || campaign;
  const logs = [];
  const now = new Date();
  const phone = notifyPhone(complaint);
  const ticketNo = complaint.ticketNo;
  if (!phone) return logs;

  if (!campaign) {
    logs.push({
      recipient: phone,
      subject: `ASSIGNED WA ${ticketNo}`,
      emailType: 'WHATSAPP_ASSIGNED',
      status: 'SKIPPED',
      errorMessage: 'AISENSY_COMPLAINT_ASSIGNED_CAMPAIGN not set',
      sentAt: now,
    });
    return logs;
  }

  try {
    await aisensyService.sendCampaignMessage({
      destination: phone,
      userName: complaint.customerName || 'Customer',
      campaignName: campaign,
      templateName: template,
      templateParams: [
        String(complaint.customerName || 'Customer'),
        String(ticketNo || ''),
        String(engineerName || 'Engineer'),
        trackUrl(ticketNo),
      ],
      source: env.aisensy.source,
      allowEnvMediaFallback: false,
    });
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

  return logs;
}

module.exports = {
  notifyCustomerTicketCreated,
  notifyCustomerTicketResolved,
  notifyCustomerTicketAssigned,
  trackUrl,
  normalizeChannel,
  notifyPhone,
};

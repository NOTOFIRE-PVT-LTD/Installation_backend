const User = require('../models/User.model');
const WhatsAppLog = require('../models/WhatsAppLog.model');
const aisensyService = require('./aisensy.service');
const env = require('../config/env');
const { ROLES, USER_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

function formatInr(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
}

function slugify(value) {
  return String(value || 'station')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'station';
}

function isPdfUrl(url = '') {
  const lower = String(url).toLowerCase();
  return lower.includes('.pdf') || lower.includes('/raw/upload/');
}

function buildPdfFilename(stationName, label) {
  return `${slugify(stationName)}-${label}.pdf`;
}

function resolveStationPdfMedia(station) {
  const stationName = station.name || 'Station';
  const source = env.aisensy.mediaSource || 'station';

  const fromFile = (file, label) => {
    if (!file?.url || !isPdfUrl(file.url)) return null;
    return {
      url: file.url,
      filename: buildPdfFilename(stationName, label),
      label,
    };
  };

  const attachmentResolvers = {
    signed_checklist: () => fromFile(station.checklistSignedFile, 'signed-checklist'),
    checklist: () => fromFile(station.checklistFile, 'checklist'),
    cad: () => {
      const files = Array.isArray(station.cadDrawingFiles) ? station.cadDrawingFiles : [];
      const pdf = files.find((f) => f.resourceType === 'raw' || isPdfUrl(f.url));
      return fromFile(pdf, 'cad-file') || fromFile(station.cadDrawingFile, 'cad-drawing');
    },
  };

  if (source !== 'station' && source !== 'env') {
    return attachmentResolvers[source]?.() || null;
  }

  if (source === 'env') {
    return null;
  }

  return (
    fromFile(station.checklistSignedFile, 'signed-checklist') ||
    fromFile(station.checklistFile, 'checklist') ||
    attachmentResolvers.cad()
  );
}

function resolveNotificationMedia(station) {
  const stationMedia = resolveStationPdfMedia(station);
  if (stationMedia) return stationMedia;

  if (env.aisensy.mediaUrl) {
    return {
      url: env.aisensy.mediaUrl,
      filename: env.aisensy.mediaFilename || 'notification.pdf',
      label: 'env-fallback',
    };
  }

  return null;
}

async function findTenderNotificationAdmins() {
  const admins = await User.find({
    role: ROLES.ADMIN,
    status: USER_STATUS.ACTIVE,
  }).populate('permissions');

  return admins.filter((admin) => {
    if (!admin.permissions?.tenderWhatsappAlerts) return false;
    const mobile = aisensyService.formatDestination(admin.mobileNumber);
    return Boolean(mobile);
  });
}

async function findBgDeadlineNotificationAdmins() {
  const admins = await User.find({
    role: ROLES.ADMIN,
    status: USER_STATUS.ACTIVE,
  }).populate('permissions');

  return admins.filter((admin) => {
    if (!admin.permissions?.bgWhatsappAlerts) return false;
    const mobile = aisensyService.formatDestination(admin.mobileNumber);
    return Boolean(mobile);
  });
}

function formatDateForTemplate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function toYmdInTimeZone(date = new Date(), timeZone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addCalendarDaysYmd(ymd, days) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function dateToYmdUtc(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function notifyTenderCreated({ tender, submittedBy }) {
  const eventType = 'tender_created';

  const baseLog = {
    eventType,
    triggeredBy: submittedBy,
  };

  if (!tender) return;

  if (!env.aisensy.enabled) {
    logger.debug('[whatsapp] Skipped tender notification — Aisensy disabled');
    await logWhatsAppAttempt({
      ...baseLog,
      recipient: null,
      mobileNumber: 'N/A',
      status: 'skipped',
      message: 'WhatsApp notifications are disabled (AISENSY_ENABLED=false)',
    });
    return;
  }

  const admins = await findTenderNotificationAdmins();
  if (admins.length === 0) {
    logger.warn('[whatsapp] No admins with tenderWhatsappAlerts permission and valid mobile number to notify');
    await logWhatsAppAttempt({
      ...baseLog,
      recipient: null,
      mobileNumber: 'N/A',
      status: 'skipped',
      message:
        'No admins configured for WhatsApp Tender alerts. Enable "Tender WhatsApp alerts" permission for at least one admin and add a valid mobile number.',
    });
    return;
  }

  const nitNumber = String(tender.nitNumber || '');
  const loaNumber = String(tender.loaNumber || '');
  const contractorName = String(tender.contractorName || '');
  // Log summary only — AiSensy template `tender_doc` is static text with no params/media.
  const summary = `Tender ${nitNumber} completed. LOA: ${loaNumber || '-'} · Contractor: ${contractorName || '-'}`;

  await Promise.all(
    admins.map(async (admin) => {
      try {
        const providerResponse = await aisensyService.sendCampaignMessage({
          destination: admin.mobileNumber,
          userName: admin.name,
          templateParams: [],
          campaignName: 'tender_document',
          templateName: 'tender_doc',
          allowEnvMediaFallback: false,
        });

        if (providerResponse?.skipped) {
          await logWhatsAppAttempt({
            ...baseLog,
            recipient: admin,
            mobileNumber: admin.mobileNumber,
            status: 'skipped',
            message: summary,
            providerResponse,
          });
          return;
        }

        await logWhatsAppAttempt({
          ...baseLog,
          recipient: admin,
          mobileNumber: admin.mobileNumber,
          status: 'sent',
          message: summary,
          providerResponse,
        });
      } catch (err) {
        await logWhatsAppAttempt({
          ...baseLog,
          recipient: admin,
          mobileNumber: admin.mobileNumber,
          status: 'failed',
          message: summary,
          error: err.message,
        });
        logger.error(`[whatsapp] Failed to notify ${admin.email}:`, err.message);
      }
    })
  );
}

async function findClaimApprovalAdmins() {
  const admins = await User.find({
    role: ROLES.ADMIN,
    status: USER_STATUS.ACTIVE,
  }).populate('permissions');

  return admins.filter((admin) => {
    if (!admin.permissions?.claimApprovals) return false;
    const mobile = aisensyService.formatDestination(admin.mobileNumber);
    return Boolean(mobile);
  });
}

async function logWhatsAppAttempt({
  recipient,
  mobileNumber,
  eventType,
  status,
  message,
  error,
  providerResponse,
  project,
  stationId,
  triggeredBy,
}) {
  try {
    await WhatsAppLog.create({
      recipient: recipient?._id || null,
      mobileNumber,
      eventType,
      status,
      message,
      error: error || '',
      providerResponse: providerResponse || null,
      project: project?._id || project || null,
      stationId: stationId || null,
      triggeredBy: triggeredBy?._id || triggeredBy || null,
    });
  } catch (err) {
    logger.error('[whatsapp] Failed to write log:', err.message);
  }
}

async function notifyClaimSubmitted({ project, station, submittedBy }) {
  const baseLog = {
    eventType: 'claim_submitted',
    project,
    stationId: station._id,
    triggeredBy: submittedBy,
  };

  if (!env.aisensy.enabled) {
    logger.debug('[whatsapp] Skipped claim notification — Aisensy disabled');
    await logWhatsAppAttempt({
      ...baseLog,
      recipient: null,
      mobileNumber: 'N/A',
      status: 'skipped',
      message: 'WhatsApp notifications are disabled (AISENSY_ENABLED=false)',
    });
    return;
  }

  const admins = await findClaimApprovalAdmins();
  if (admins.length === 0) {
    logger.warn('[whatsapp] No admins with claimApprovals permission and valid mobile number to notify');
    await logWhatsAppAttempt({
      ...baseLog,
      recipient: null,
      mobileNumber: 'N/A',
      status: 'skipped',
      message:
        'No admins configured for WhatsApp alerts. Enable "Claim Approvals + WhatsApp alerts" permission and add a valid mobile number on admin profile.',
    });
    return;
  }

  const installerName = submittedBy?.name || station.installer?.name || project.installerName || 'Installer';
  const projectName = project.projectName || project.workName || 'Project';
  const stationName = station.name || 'Station';
  const claimRequests = Array.isArray(station.claimRequests) ? station.claimRequests : [];
  const amountRequestedNum = Math.max(0, Math.round(Number(station.amountClaimed) || 0));
  const allocatedNum = Math.max(0, Math.round(Number(station.installationAmount) || 0));
  const remainingAmountNum = Math.max(0, allocatedNum - amountRequestedNum);
  const amountRequestedPretty = formatInr(amountRequestedNum);
  const subpartCount = claimRequests.filter((r) => Number(r.amountRequested) > 0).length;
  const approvalsUrl = `${env.clientUrl}/approvals`;

  // Match your AiSensy template placeholders (default 3-param):
  // {{1}} Station | {{2}} Amount Requested | {{3}} Remaining Amount
  const templateParams =
    env.aisensy.templateParamMode === 'extended'
      ? [
          stationName,
          String(amountRequestedNum),
          String(remainingAmountNum),
          installerName,
          projectName,
          subpartCount > 1 ? `${subpartCount} subparts` : '1 subpart',
          approvalsUrl,
        ]
      : [stationName, String(amountRequestedNum), String(remainingAmountNum)];

  const summary =
    subpartCount > 1
      ? `${installerName} requested ${amountRequestedPretty} (${subpartCount} payment subparts) for ${stationName} (${projectName})`
      : `${installerName} requested ${amountRequestedPretty} for ${stationName} (${projectName})`;

  const media = resolveNotificationMedia(station);
  if (!media?.url) {
    const skipMessage = `${summary} — No PDF attached on station (upload signed checklist before submitting).`;
    await Promise.all(
      admins.map((admin) =>
        logWhatsAppAttempt({
          recipient: admin,
          mobileNumber: admin.mobileNumber,
          eventType: 'claim_submitted',
          status: 'skipped',
          message: skipMessage,
          error: 'No station PDF found. Upload signed checklist / checklist PDF on the station page.',
          project,
          stationId: station._id,
          triggeredBy: submittedBy,
        })
      )
    );
    logger.warn('[whatsapp] Skipped claim notification — no station PDF attachment found');
    return;
  }

  const summaryWithPdf = `${summary} · PDF: ${media.filename}`;

  await Promise.all(
    admins.map(async (admin) => {
      const mobileNumber = admin.mobileNumber;

      try {
        const providerResponse = await aisensyService.sendCampaignMessage({
          destination: mobileNumber,
          userName: admin.name,
          templateParams,
          media: { url: media.url, filename: media.filename },
        });

        if (providerResponse?.skipped) {
          await logWhatsAppAttempt({
            recipient: admin,
            mobileNumber,
            eventType: 'claim_submitted',
            status: 'skipped',
            message: summaryWithPdf,
            providerResponse,
            project,
            stationId: station._id,
            triggeredBy: submittedBy,
          });
          return;
        }

        await logWhatsAppAttempt({
          recipient: admin,
          mobileNumber,
          eventType: 'claim_submitted',
          status: 'sent',
          message: summaryWithPdf,
          providerResponse,
          project,
          stationId: station._id,
          triggeredBy: submittedBy,
        });
      } catch (err) {
        await logWhatsAppAttempt({
          recipient: admin,
          mobileNumber,
          eventType: 'claim_submitted',
          status: 'failed',
          message: summaryWithPdf,
          error: err.message,
          project,
          stationId: station._id,
          triggeredBy: submittedBy,
        });
        logger.error(`[whatsapp] Failed to notify ${admin.email}:`, err.message);
      }
    })
  );
}

/**
 * Sends BG deadline reminders for Financial Documents whose LOA Date was exactly 14 days ago.
 * Template: bg_deadline
 * Campaign: bg_deadline_camp
 * {{1}} Tender Name | {{2}} BG Deadline (LOA Date + 21 days)
 */
async function notifyBgDeadlineReminders() {
  const eventType = 'bg_deadline_reminder';
  const FinancialDocument = require('../models/FinancialDocument.model');

  if (!env.aisensy.enabled) {
    logger.debug('[whatsapp] Skipped BG deadline reminders — Aisensy disabled');
    return { processed: 0, sent: 0, skipped: true };
  }

  const todayYmd = toYmdInTimeZone(new Date(), 'Asia/Kolkata');
  const targetLoaYmd = addCalendarDaysYmd(todayYmd, -14);

  const candidates = await FinancialDocument.find({
    loaDate: { $ne: null },
    bgReminder14SentAt: null,
    bgSubmission: null,
  }).lean();

  const dueDocs = candidates.filter((doc) => dateToYmdUtc(doc.loaDate) === targetLoaYmd);
  if (dueDocs.length === 0) {
    logger.debug(`[whatsapp] No BG deadline reminders due for LOA date ${targetLoaYmd}`);
    return { processed: 0, sent: 0 };
  }

  const admins = await findBgDeadlineNotificationAdmins();
  if (admins.length === 0) {
    logger.warn('[whatsapp] No admins with bgWhatsappAlerts permission and valid mobile number');
    await logWhatsAppAttempt({
      eventType,
      recipient: null,
      mobileNumber: 'N/A',
      status: 'skipped',
      message:
        'No admins configured for BG Deadline WhatsApp alerts. Enable "BG Deadline WhatsApp alerts" and add a valid mobile number.',
    });
    return { processed: dueDocs.length, sent: 0, skipped: true };
  }

  let sent = 0;

  for (const doc of dueDocs) {
    const tenderName = String(doc.tenderName || doc.loaNumber || 'Tender').trim() || 'Tender';
    const deadlineDate = doc.bgDeadline21 || (() => {
      if (!doc.loaDate) return null;
      const d = new Date(doc.loaDate);
      d.setUTCDate(d.getUTCDate() + 21);
      return d;
    })();
    const deadlineStr = formatDateForTemplate(deadlineDate) || '-';
    const templateParams = [tenderName, deadlineStr];
    const summary = `BG reminder for ${tenderName} — submit by ${deadlineStr} (LOA + 14 day alert)`;

    let anySent = false;

    await Promise.all(
      admins.map(async (admin) => {
        try {
          const providerResponse = await aisensyService.sendCampaignMessage({
            destination: admin.mobileNumber,
            userName: admin.name,
            templateParams,
            campaignName: 'bg_deadline_camp',
            templateName: 'bg_deadline',
            allowEnvMediaFallback: false,
          });

          if (providerResponse?.skipped) {
            await logWhatsAppAttempt({
              eventType,
              recipient: admin,
              mobileNumber: admin.mobileNumber,
              status: 'skipped',
              message: summary,
              providerResponse,
            });
            return;
          }

          anySent = true;
          sent += 1;
          await logWhatsAppAttempt({
            eventType,
            recipient: admin,
            mobileNumber: admin.mobileNumber,
            status: 'sent',
            message: summary,
            providerResponse,
          });
        } catch (err) {
          await logWhatsAppAttempt({
            eventType,
            recipient: admin,
            mobileNumber: admin.mobileNumber,
            status: 'failed',
            message: summary,
            error: err.message,
          });
          logger.error(`[whatsapp] BG reminder failed for ${admin.email}:`, err.message);
        }
      })
    );

    // Mark as sent when at least one recipient succeeded so we don't spam daily.
    // If all failed, leave null so the next hourly run can retry.
    if (anySent) {
      await FinancialDocument.updateOne({ _id: doc._id }, { $set: { bgReminder14SentAt: new Date() } });
    }
  }

  logger.info(`[whatsapp] BG deadline reminders processed=${dueDocs.length} sent=${sent} for LOA ${targetLoaYmd}`);
  return { processed: dueDocs.length, sent };
}

module.exports = {
  notifyClaimSubmitted,
  findClaimApprovalAdmins,
  resolveNotificationMedia,
  notifyTenderCreated,
  notifyBgDeadlineReminders,
  findBgDeadlineNotificationAdmins,
};

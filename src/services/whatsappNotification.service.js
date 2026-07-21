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
    cad: () => fromFile(station.cadDrawingFile, 'cad-drawing'),
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
    fromFile(station.cadDrawingFile, 'cad-drawing')
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

module.exports = { notifyClaimSubmitted, findClaimApprovalAdmins, resolveNotificationMedia };

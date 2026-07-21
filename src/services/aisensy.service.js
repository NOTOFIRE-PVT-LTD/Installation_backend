const env = require('../config/env');
const logger = require('../utils/logger');

const AISENSY_API_URL = 'https://backend.aisensy.com/campaign/t1/api/v2';

function formatDestination(mobileNumber) {
  const digits = String(mobileNumber || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function buildMediaPayload(media) {
  if (!media?.url) return null;
  return {
    url: media.url,
    filename: media.filename || 'document.pdf',
  };
}

async function sendCampaignMessage({ destination, userName, templateParams = [], source, media }) {
  if (!env.aisensy.enabled) {
    return { skipped: true, reason: 'Aisensy is disabled' };
  }
  if (!env.aisensy.apiKey || !env.aisensy.campaignName) {
    throw new Error('Aisensy API key or campaign name is not configured');
  }

  const formattedDestination = formatDestination(destination);
  if (!formattedDestination) {
    throw new Error('Invalid mobile number for WhatsApp notification');
  }

  const payload = {
    apiKey: env.aisensy.apiKey,
    campaignName: env.aisensy.campaignName,
    destination: formattedDestination,
    userName: userName || 'Admin',
    source: source || env.aisensy.source,
    templateParams,
  };

  const mediaPayload =
    buildMediaPayload(media) ||
    (env.aisensy.mediaUrl
      ? buildMediaPayload({ url: env.aisensy.mediaUrl, filename: env.aisensy.mediaFilename })
      : null);

  if (mediaPayload) {
    payload.media = mediaPayload;
  }

  const response = await fetch(AISENSY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  const providerMessage = String(data?.message || data?.error || text || '').trim();
  const knownErrors = [/media url missing/i, /template params/i, /invalid api key/i, /campaign.*not found/i];
  const failed =
    !response.ok ||
    data?.success === false ||
    (providerMessage && knownErrors.some((pattern) => pattern.test(providerMessage)));

  if (failed) {
    let message = providerMessage || `Aisensy request failed (${response.status})`;
    if (/media url missing/i.test(message) && !mediaPayload) {
      message =
        'Media URL Missing — attach a signed checklist PDF on the station, or set AISENSY_MEDIA_URL in Backend/.env.';
    }
    logger.error('[aisensy] Send failed:', message, data || text);
    throw new Error(message);
  }

  return data;
}

module.exports = { sendCampaignMessage, formatDestination };

const WhatsAppLog = require('../models/WhatsAppLog.model');
const env = require('../config/env');
const { findClaimApprovalAdmins } = require('./whatsappNotification.service');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');

const ALLOWED_SORT_FIELDS = ['createdAt', 'status', 'eventType'];
const POPULATE = [
  { path: 'recipient', select: 'name email mobileNumber' },
  { path: 'triggeredBy', select: 'name email role' },
  { path: 'project', select: 'projectName workName' },
];

async function list(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS);

  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.eventType) filter.eventType = query.eventType;

  const [items, total] = await Promise.all([
    WhatsAppLog.find(filter).sort(sort).skip(skip).limit(pageSize).populate(POPULATE).lean(),
    WhatsAppLog.countDocuments(filter),
  ]);

  return buildPaginatedResult({ items, total, page, pageSize });
}

async function getSetupStatus() {
  const admins = await findClaimApprovalAdmins();
  const [lastLog, counts] = await Promise.all([
    WhatsAppLog.findOne().sort({ createdAt: -1 }).populate('recipient', 'name email').lean(),
    WhatsAppLog.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  const statusCounts = counts.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

  return {
    enabled: env.aisensy.enabled,
    hasApiKey: Boolean(env.aisensy.apiKey),
    hasCampaignName: Boolean(env.aisensy.campaignName),
    hasMediaUrl: Boolean(env.aisensy.mediaUrl),
    mediaSource: env.aisensy.mediaSource || 'station',
    campaignName: env.aisensy.campaignName,
    templateName: env.aisensy.templateName,
    recipientAdminCount: admins.length,
    recipientAdmins: admins.map((admin) => ({
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      mobileNumber: admin.mobileNumber,
    })),
    statusCounts,
    lastLog,
    hints: [
      !env.aisensy.enabled && 'Set AISENSY_ENABLED=true in Backend/.env',
      !env.aisensy.apiKey && 'Set AISENSY_API_KEY in Backend/.env',
      !env.aisensy.campaignName && 'Set AISENSY_CAMPAIGN_NAME in Backend/.env',
      (env.aisensy.mediaSource || 'station') === 'env' &&
        !env.aisensy.mediaUrl &&
        'Set AISENSY_MEDIA_URL — media source is set to env but no URL configured',
      admins.length === 0 &&
        'Enable "Claim Approvals + WhatsApp alerts" for at least one admin with a valid mobile number',
    ].filter(Boolean),
  };
}

module.exports = { list, getSetupStatus };

require('../config/env');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const connectDB = require('../config/db');
const User = require('../models/User.model');
const permissionService = require('../services/permission.service');
const { ROLES, ADMIN_TYPES, PERMISSION_KEYS, USER_STATUS } = require('../config/constants');
const logger = require('../utils/logger');

const APPS = [
  {
    key: 'shipping',
    flag: 'shipping',
    url: process.env.SHIPPING_SUPABASE_URL,
    service: process.env.SHIPPING_SUPABASE_SERVICE_ROLE_KEY,
    activeField: 'active',
  },
  {
    key: 'import',
    flag: 'importControl',
    url: process.env.IMPORT_SUPABASE_URL,
    service: process.env.IMPORT_SUPABASE_SERVICE_ROLE_KEY,
    activeField: 'is_active',
  },
];

function skipEmail(email) {
  const value = String(email || '').toLowerCase();
  if (!value.includes('@')) return true;
  if (value.endsWith('.local')) return true;
  return false;
}

function digitsOf(value) {
  return String(value || '').replace(/\D/g, '');
}

async function uniquePhone(email, fallback) {
  const fromProfile = digitsOf(fallback);
  const fromEmail = digitsOf(email);
  const fromHash = digitsOf(crypto.createHash('sha1').update(String(email || crypto.randomUUID())).digest('hex')).padEnd(10, '7');
  const seed = (fromProfile.slice(-10) || fromEmail.slice(-10) || fromHash.slice(0, 10)).padStart(10, '9');
  let n = Number(seed);
  if (!Number.isFinite(n) || n < 9000000000) n = 9000000000 + Math.abs(n % 1000000000);
  for (let i = 0; i < 50; i += 1) {
    const phone = String(n + i);
    if (!phone || phone.length !== 10) continue;
    const taken = await User.findOne({ mobileNumber: phone }).select('_id');
    if (!taken) return phone;
  }
  return `9${Date.now().toString().slice(-9)}`;
}

async function loadProfiles(app) {
  if (!app.url || !app.service) {
    logger.warn(`[syncCompanion] ${app.key} is not configured, skipping`);
    return [];
  }
  const admin = createClient(app.url, app.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.from('profiles').select('*');
  if (error) {
    logger.warn(`[syncCompanion] ${app.key} profiles failed: ${error.message}`);
    return [];
  }
  return (data || []).map((row) => ({
    email: String(row.email || '').trim().toLowerCase(),
    name: row.full_name || row.email || 'Companion user',
    role: row.role,
    phone: row.phone,
    active: row[app.activeField] !== false,
    app: app.key,
    flag: app.flag,
  }));
}

async function applyFlags(user, flags) {
  const permission = await permissionService.updatePermissions(user._id, flags, user._id);
  if (permission && !user.permissions) {
    await User.updateOne({ _id: user._id }, { permissions: permission._id });
    user.permissions = permission._id;
  }
}

async function upsertValueconUser(profile) {
  if (skipEmail(profile.email)) return { skipped: true };

  let user = await User.findOne({ email: profile.email });
  const isAdminRole = profile.role === 'admin';
  const flags =
    user?.adminType === ADMIN_TYPES.SUPER_ADMIN
      ? PERMISSION_KEYS.reduce((acc, key) => ({ ...acc, [key]: true }), {})
      : { [profile.flag]: true };

  if (!user) {
    try {
      user = await User.create({
        name: profile.name,
        email: profile.email,
        password: `Companion!${crypto.randomBytes(6).toString('hex')}`,
        mobileNumber: await uniquePhone(profile.email, profile.phone),
        role: isAdminRole ? ROLES.ADMIN : ROLES.USER,
        adminType: isAdminRole ? ADMIN_TYPES.GENERAL_ADMIN : undefined,
        status: profile.active ? USER_STATUS.ACTIVE : USER_STATUS.INACTIVE,
      });
    } catch (err) {
      logger.warn(`[syncCompanion] skip ${profile.email}: ${err.message}`);
      return { skipped: true };
    }
    await applyFlags(user, flags);
    logger.info(`[syncCompanion] created ${profile.email} for ${profile.app}`);
    return { created: true, email: profile.email };
  }

  await applyFlags(user, flags);
  logger.info(
    user.adminType === ADMIN_TYPES.SUPER_ADMIN
      ? `[syncCompanion] super admin ${profile.email} granted all apps`
      : `[syncCompanion] updated ${profile.email} with ${profile.flag}`
  );
  return { updated: true, email: profile.email };
}

async function grantSuperAdminsAllApps() {
  const supers = await User.find({ adminType: ADMIN_TYPES.SUPER_ADMIN });
  const all = PERMISSION_KEYS.reduce((acc, key) => ({ ...acc, [key]: true }), {});
  for (const user of supers) {
    await permissionService.updatePermissions(user._id, all, user._id);
    logger.info(`[syncCompanion] ${user.email} is Super Admin with shipping + import`);
  }
  return supers.length;
}

async function run() {
  await connectDB();
  await grantSuperAdminsAllApps();

  const created = [];
  const updated = [];
  for (const app of APPS) {
    const profiles = await loadProfiles(app);
    logger.info(`[syncCompanion] ${app.key} profiles=${profiles.length}`);
    for (const profile of profiles) {
      try {
        const result = await upsertValueconUser(profile);
        if (result.created) created.push(result.email);
        if (result.updated) updated.push(result.email);
      } catch (err) {
        logger.warn(`[syncCompanion] ${profile.email || profile.app}: ${err.message}`);
      }
    }
  }

  logger.info(`[syncCompanion] created=${created.length} updated=${updated.length}`);
  process.exit(0);
}

run().catch((err) => {
  logger.error('[syncCompanion] Failed:', err);
  process.exit(1);
});

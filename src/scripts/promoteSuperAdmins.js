const connectDB = require('../config/db');
const User = require('../models/User.model');
const permissionService = require('../services/permission.service');
const { ROLES, ADMIN_TYPES, PERMISSION_KEYS } = require('../config/constants');
const { PLATFORM_OWNER_EMAILS, permissionsForApp } = require('../utils/roles');
const logger = require('../utils/logger');

async function promoteMatchingSuperAdmins() {
  const allTrue = PERMISSION_KEYS.reduce((acc, key) => ({ ...acc, [key]: true }), {});
  const promoted = [];

  const gaurav = await User.find({ name: /gaurav\s*jain/i });
  for (const user of gaurav) {
    const permission = await permissionService.updatePermissions(user._id, allTrue, user._id);
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          role: ROLES.ADMIN,
          adminType: ADMIN_TYPES.SUPER_ADMIN,
          appSuperAdmin: false,
          ...(user.permissions ? {} : { permissions: permission._id }),
        },
      }
    );
    promoted.push({ name: user.name, email: user.email });
    logger.info(`[superadmin] ${user.name} <${user.email}> is the all-apps Super Admin`);
  }

  const monikas = await User.find({ name: /^monika\b/i });
  const monikaFlags = PERMISSION_KEYS.reduce((acc, key) => ({ ...acc, [key]: false }), {});
  for (const app of ['complaints', 'projects']) {
    const flags = permissionsForApp(app);
    for (const key of PERMISSION_KEYS) {
      if (flags[key]) monikaFlags[key] = true;
    }
  }
  monikaFlags.users = true;
  for (const user of monikas) {
    if (PLATFORM_OWNER_EMAILS.includes(String(user.email || '').toLowerCase())) continue;
    const permission = await permissionService.updatePermissions(user._id, monikaFlags, user._id);
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          role: ROLES.ADMIN,
          adminType: ADMIN_TYPES.GENERAL_ADMIN,
          appSuperAdmin: true,
          ...(user.permissions ? {} : { permissions: permission._id }),
        },
      }
    );
    logger.info(`[superadmin] ${user.name} <${user.email}> is Projects + Complaint Resolution Super Admin`);
  }

  return promoted;
}

async function run() {
  await connectDB();
  const promoted = await promoteMatchingSuperAdmins();
  if (!promoted.length) {
    logger.warn('[superadmin] Gaurav Jain was not found.');
  }
  process.exit(0);
}

if (require.main === module) {
  run().catch((err) => {
    logger.error('[superadmin] Failed:', err);
    process.exit(1);
  });
}

module.exports = { promoteMatchingSuperAdmins };

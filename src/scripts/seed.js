const connectDB = require('../config/db');
const env = require('../config/env');
const User = require('../models/User.model');
const permissionService = require('../services/permission.service');
const { ROLES } = require('../config/constants');
const logger = require('../utils/logger');

async function seed() {
  await connectDB();

  const existing = await User.findOne({ email: env.seedAdmin.email.toLowerCase() });
  if (existing) {
    logger.info(`[seed] Admin already exists: ${existing.email}`);
    process.exit(0);
  }

  const admin = await User.create({
    name: env.seedAdmin.name,
    email: env.seedAdmin.email,
    password: env.seedAdmin.password,
    mobileNumber: env.seedAdmin.mobileNumber,
    role: ROLES.ADMIN,
  });

  const permission = await permissionService.createDefaultPermissions(admin._id, {
    grantAll: true,
    actorId: admin._id,
  });

  admin.permissions = permission._id;
  await admin.save();

  logger.info(`[seed] Created admin user: ${admin.email} / password: ${env.seedAdmin.password}`);
  process.exit(0);
}

seed().catch((err) => {
  logger.error('[seed] Failed:', err);
  process.exit(1);
});

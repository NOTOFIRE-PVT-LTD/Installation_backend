const connectDB = require('../config/db');
const env = require('../config/env');
const User = require('../models/User.model');
const Customer = require('../models/Customer.model');
const Visit = require('../models/Visit.model');
const Attendance = require('../models/Attendance.model');
const permissionService = require('../services/permission.service');
const { ROLES, USER_STATUS, ADMIN_TYPES, JOB_ROLES, VISIT_STATUS, PERMISSION_KEYS } = require('../config/constants');
const { normalizeCompanyName, normalizePhone } = require('../utils/customerNormalize');
const { kolkataToday } = require('../utils/kolkataDate');
const { shiftDate, durationMin } = require('../utils/attendanceClassify');
const logger = require('../utils/logger');

const TRACKING_KEYS = { salespersonTracking: true, customers: true, attendance: true };
const TENDER_KEYS = {
  tenders: true,
  tenderWhatsappAlerts: true,
  dashboard: true,
  salespersonTracking: false,
  customers: false,
  attendance: false,
};
const SALESPERSON_KEYS = {
  customers: true,
  attendance: true,
  projects: false,
  reports: false,
  cadDrawing: false,
  atlantaPayments: false,
};

async function ensureUser({ name, email, password, mobileNumber, role, adminType, jobRole, permissions, grantAll, gender }) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    let dirty = false;
    if (name && existing.name !== name) {
      existing.name = name;
      dirty = true;
    }
    if (adminType && existing.adminType !== adminType) {
      existing.adminType = adminType;
      dirty = true;
    }
    if (jobRole && existing.jobRole !== jobRole) {
      existing.jobRole = jobRole;
      dirty = true;
    }
    if (gender && existing.gender !== gender) {
      existing.gender = gender;
      dirty = true;
    }
    if (permissions || grantAll) {
      if (!existing.permissions) {
        const permission = await permissionService.createDefaultPermissions(existing._id, {
          grantAll: Boolean(grantAll),
          actorId: existing._id,
        });
        existing.permissions = permission._id;
        dirty = true;
      }
      if (grantAll) {
        const all = PERMISSION_KEYS.reduce((acc, key) => ({ ...acc, [key]: true }), {});
        await permissionService.updatePermissions(existing._id, all, existing._id);
      } else if (permissions) {
        await permissionService.updatePermissions(existing._id, permissions, existing._id);
      }
    }
    if (dirty) await existing.save();
    logger.info(`[seed] User exists: ${email}`);
    return existing;
  }
  const user = await User.create({
    name,
    email,
    password,
    mobileNumber,
    role,
    adminType,
    jobRole,
    gender,
    status: USER_STATUS.ACTIVE,
  });
  const permission = await permissionService.createDefaultPermissions(user._id, {
    grantAll: Boolean(grantAll),
    actorId: user._id,
  });
  if (permissions) {
    await permissionService.updatePermissions(user._id, permissions, user._id);
  }
  user.permissions = permission._id;
  await user.save();
  logger.info(`[seed] Created ${adminType || jobRole || role}: ${email} / ${password}`);
  return user;
}

async function seed() {
  await connectDB();

  const existingAdmin = await User.findOne({ email: env.seedAdmin.email.toLowerCase() });
  if (!existingAdmin) {
    const admin = await User.create({
      name: env.seedAdmin.name,
      email: env.seedAdmin.email,
      password: env.seedAdmin.password,
      mobileNumber: env.seedAdmin.mobileNumber,
      role: ROLES.ADMIN,
      adminType: ADMIN_TYPES.SUPER_ADMIN,
    });
    const permission = await permissionService.createDefaultPermissions(admin._id, {
      grantAll: true,
      actorId: admin._id,
    });
    admin.permissions = permission._id;
    await admin.save();
    logger.info(`[seed] Created super admin: ${admin.email} / ${env.seedAdmin.password}`);
  } else {
    if (existingAdmin.adminType !== ADMIN_TYPES.SUPER_ADMIN) {
      existingAdmin.adminType = ADMIN_TYPES.SUPER_ADMIN;
      await existingAdmin.save();
    }
    logger.info(`[seed] Super admin already exists: ${existingAdmin.email}`);
  }

  if (env.seedAdmin.email.toLowerCase() !== 'super.admin@demo.local') {
    await ensureUser({
      name: 'Super Admin',
      email: ' ',
      password: 'Demo!Pass123',
      mobileNumber: '9999900001',
      role: ROLES.ADMIN,
      adminType: ADMIN_TYPES.SUPER_ADMIN,
      grantAll: true,
    });
  }

  const trackingAdmin = await ensureUser({
    name: 'Radha Mam',
    email: 'radha.admin@demo.local',
    password: 'Demo!Pass123',
    mobileNumber: '9876500001',
    role: ROLES.ADMIN,
    adminType: ADMIN_TYPES.SALES_COORDINATOR,
    permissions: TRACKING_KEYS,
  });

  await ensureUser({
    name: 'Yashika',
    email: 'yashika.admin@demo.local',
    password: 'Demo!Pass123',
    mobileNumber: '9876500004',
    role: ROLES.ADMIN,
    adminType: ADMIN_TYPES.TENDER_COORDINATOR,
    permissions: TENDER_KEYS,
  });

  const sp1 = await ensureUser({
    name: 'Salesperson Demo 1',
    email: 'salesperson.one@demo.local',
    password: 'Demo!Pass123',
    mobileNumber: '9876500002',
    role: ROLES.USER,
    jobRole: JOB_ROLES.SALESPERSON,
    permissions: SALESPERSON_KEYS,
    gender: 'MALE',
  });
  await ensureUser({
    name: 'Salesperson Demo 2',
    email: 'salesperson.two@demo.local',
    password: 'Demo!Pass123',
    mobileNumber: '9876500003',
    role: ROLES.USER,
    jobRole: JOB_ROLES.SALESPERSON,
    permissions: SALESPERSON_KEYS,
    gender: 'FEMALE',
  });

  const demoCustomers = [
    {
      companyName: 'ABC Company',
      contactPerson: 'Asha Rao',
      phone: '9876543210',
      city: 'Pune',
      state: 'Maharashtra',
      address: 'Pune, Maharashtra',
      locationLat: 18.5204,
      locationLng: 73.8567,
    },
    {
      companyName: 'XYZ Company',
      contactPerson: 'Vikram Shah',
      phone: '9876501234',
      city: 'Nashik',
      state: 'Maharashtra',
      address: 'Nashik, Maharashtra',
      locationLat: 19.9975,
      locationLng: 73.7898,
    },
  ];
  const customers = [];
  for (const row of demoCustomers) {
    let doc = await Customer.findOne({ normalizedCompanyName: normalizeCompanyName(row.companyName) });
    if (!doc) {
      doc = await Customer.create({
        ...row,
        normalizedCompanyName: normalizeCompanyName(row.companyName),
        phoneNormalized: normalizePhone(row.phone),
        assignedSalesperson: sp1._id,
        active: true,
        createdBy: trackingAdmin._id,
        updatedBy: trackingAdmin._id,
      });
      logger.info(`[seed] Customer: ${row.companyName}`);
    } else {
      if (doc.locationLat == null) {
        doc.locationLat = row.locationLat;
        doc.locationLng = row.locationLng;
        doc.address = row.address;
        if (!doc.assignedSalesperson) doc.assignedSalesperson = sp1._id;
        await doc.save();
      }
    }
    customers.push(doc);
  }

  const today = kolkataToday();
  const demoVisits = [
    { customer: customers[0], plannedTime: '09:30', purpose: 'Customer Meeting' },
    { customer: customers[1], plannedTime: '14:00', purpose: 'Follow-up' },
  ];
  for (const row of demoVisits) {
    const exists = await Visit.findOne({
      salesperson: sp1._id,
      customer: row.customer._id,
      visitDate: today,
      plannedTime: row.plannedTime,
    });
    if (exists) continue;
    await Visit.create({
      salesperson: sp1._id,
      customer: row.customer._id,
      visitDate: today,
      plannedTime: row.plannedTime,
      purpose: row.purpose,
      status: VISIT_STATUS.PLANNED,
      createdBy: trackingAdmin._id,
    });
    logger.info(`[seed] Visit: ${row.customer.companyName} ${row.plannedTime}`);
  }

  const pastAttendance = [
    { offset: -1, inHm: '09:08', outHm: '18:11' },
    { offset: -2, inHm: '09:21', outHm: '17:52' },
    { offset: -3, inHm: '09:04', outHm: null },
  ];
  for (const row of pastAttendance) {
    const attendanceDate = shiftDate(today, row.offset);
    const exists = await Attendance.findOne({ salesperson: sp1._id, attendanceDate });
    if (exists) continue;
    const punchInAt = new Date(`${attendanceDate}T${row.inHm}:00+05:30`);
    const punchOutAt = row.outHm ? new Date(`${attendanceDate}T${row.outHm}:00+05:30`) : null;
    await Attendance.create({
      salesperson: sp1._id,
      attendanceDate,
      punchInAt,
      punchOutAt,
      durationMin: punchOutAt ? durationMin(punchInAt, punchOutAt) : null,
      status: punchOutAt ? Attendance.ATTENDANCE_STATUS.CLOSED : Attendance.ATTENDANCE_STATUS.OPEN,
    });
    logger.info(`[seed] Attendance ${attendanceDate} ${row.inHm}${row.outHm ? `–${row.outHm}` : ' (open)'}`);
  }

  const { promoteMatchingSuperAdmins } = require('./promoteSuperAdmins');
  await promoteMatchingSuperAdmins();

  logger.info('[seed] Demo logins (password Demo!Pass123):');
  logger.info('  super.admin@demo.local          → Super Admin');
  logger.info('  radha.admin@demo.local          → Sales Coordinator (tracking only)');
  logger.info('  yashika.admin@demo.local        → Tender Coordinator');
  logger.info('  salesperson.one@demo.local      → salesperson');
  logger.info(`  ${env.seedAdmin.email}          → full Installation + tracking`);
  process.exit(0);
}

seed().catch((err) => {
  logger.error('[seed] Failed:', err);
  process.exit(1);
});

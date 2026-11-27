const permissionRepository = require('../repositories/permission.repository');
const { ROLES, ADMIN_TYPES, JOB_ROLES, PERMISSION_KEYS } = require('../config/constants');
const { isSuperAdmin, isPlatformOwner } = require('../utils/roles');
const { parseEmailList } = require('../utils/portalAccess');

function getActorAllowedApps(actor) {
  if (!actor || isSuperAdmin(actor) || isPlatformOwner(actor)) return null;
  if (actor.adminType === ADMIN_TYPES.COMPLAINT_COORDINATOR) return ['complaints'];
  if (actor.adminType === ADMIN_TYPES.SALES_COORDINATOR) return ['attendance'];
  if (actor.adminType === ADMIN_TYPES.TENDER_COORDINATOR) return ['tenders'];

  const perms = actor.permissions?._doc || actor.permissions || {};
  if (perms.salesTravelRequests && !perms.tenders && !perms.attendance && !perms.complaints) {
    return ['salesTravelRequests'];
  }
  const allowed = PERMISSION_KEYS.filter((k) => Boolean(perms[k]));
  if (perms.salespersonTracking || perms.contractorAttendance) allowed.push('attendance');
  return Array.from(new Set(allowed));
}

function resolveTargetApps(queryApps, actorApps) {
  const req = queryApps
    ? String(queryApps).split(',').map((s) => s.trim()).filter((s) => PERMISSION_KEYS.includes(s) || s === 'attendance')
    : null;
  if (!actorApps) return req;
  if (!req) return actorApps;
  const set = new Set(actorApps);
  return req.filter((k) => set.has(k));
}

function buildPermOrClauses(keys) {
  const permOr = keys.map((key) => ({ [key]: true }));
  if (keys.includes('attendance')) {
    permOr.push({ salespersonTracking: true }, { contractorAttendance: true });
  }
  if (keys.includes('billing')) {
    permOr.push({ quotations: true }, { proformaInvoices: true }, { deliveryChallans: true });
  }
  if (keys.includes('payflow')) {
    permOr.push({ payflowUser: true });
  }
  return permOr;
}

function buildAppRoleClauses(keys, userIds) {
  const appsOr = [{ _id: { $in: userIds } }];
  if (keys.includes('complaints')) {
    appsOr.push({ adminType: ADMIN_TYPES.COMPLAINT_COORDINATOR }, { jobRole: 'FIELD_ENGINEER' });
  }
  if (keys.includes('attendance')) {
    appsOr.push({ jobRole: JOB_ROLES.SALESPERSON }, { adminType: ADMIN_TYPES.SALES_COORDINATOR });
  }
  if (keys.includes('tenders')) {
    appsOr.push({ adminType: ADMIN_TYPES.TENDER_COORDINATOR });
  }
  if (keys.includes('projects')) {
    appsOr.push({ jobRole: JOB_ROLES.INSTALLER, role: ROLES.USER });
  }
  return appsOr;
}

async function buildAppsClause(keys) {
  if (!keys || !keys.length) return null;
  const permOr = buildPermOrClauses(keys);
  const permDocs = await permissionRepository.find({ $or: permOr }, { select: 'user' });
  const userIds = permDocs.map((doc) => doc.user).filter(Boolean);
  return { $or: buildAppRoleClauses(keys, userIds) };
}

function appendSearchFilter(filter, search) {
  if (!search) return;
  const searchOr = [
    { name: new RegExp(search, 'i') },
    { email: new RegExp(search, 'i') },
    { mobileNumber: new RegExp(search, 'i') },
  ];
  if (filter.$and) filter.$and.push({ $or: searchOr });
  else if (filter.$or) filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
  else filter.$or = searchOr;
}

function appendClause(filter, clause) {
  if (!clause) return;
  if (filter.$and) {
    filter.$and.push(clause);
  } else if (filter.$or) {
    filter.$and = [{ $or: filter.$or }, clause];
    delete filter.$or;
  } else {
    Object.assign(filter, clause);
  }
}

function buildBaseRoleFilter(query) {
  const filter = { portalSource: { $ne: 'pnl' } };
  const pnlList = parseEmailList(process.env.CENTRAL_PNL_EMAILS);
  if (pnlList.size) {
    filter.email = { $nin: Array.from(pnlList) };
  }
  if (query.role === ADMIN_TYPES.SUPER_ADMIN || query.adminType === ADMIN_TYPES.SUPER_ADMIN) {
    filter.role = ROLES.ADMIN;
    filter.adminType = ADMIN_TYPES.SUPER_ADMIN;
  } else if (query.role) {
    filter.role = query.role;
    if (query.role === ROLES.ADMIN) filter.adminType = { $ne: ADMIN_TYPES.SUPER_ADMIN };
  }
  if (query.adminType && query.adminType !== ADMIN_TYPES.SUPER_ADMIN) filter.adminType = query.adminType;
  if (query.jobRole) filter.jobRole = query.jobRole;
  if (query.status) filter.status = query.status;
  return filter;
}

async function buildUserFilter(query, actor) {
  const filter = buildBaseRoleFilter(query);
  appendSearchFilter(filter, query.search);

  // Attendance People staff roster: salesperson + attendance-app admin only.
  // Do not use permission-flag matching here — leftover cross-app flags / SUPER_ADMIN
  // all-true perms were pulling other-app users (e.g. Ashish) into the list.
  if (query.scope === 'attendance') {
    appendClause(filter, {
      $or: [
        { role: ROLES.USER, jobRole: JOB_ROLES.SALESPERSON },
        { role: ROLES.ADMIN, adminType: ADMIN_TYPES.SALES_COORDINATOR },
      ],
    });
  } else {
    const actorApps = getActorAllowedApps(actor);
    const targetApps = resolveTargetApps(query.apps, actorApps);

    if (targetApps) {
      if (!targetApps.length) {
        filter._id = { $in: [] };
        return filter;
      }
      const appsClause = await buildAppsClause(targetApps);
      appendClause(filter, appsClause);
    }
  }

  // Non–Super Admins never see Super Admins
  if (actor && !isSuperAdmin(actor) && !isPlatformOwner(actor)) {
    appendClause(filter, { adminType: { $ne: ADMIN_TYPES.SUPER_ADMIN } });
  }

  return filter;
}

module.exports = {
  getActorAllowedApps,
  resolveTargetApps,
  buildUserFilter,
};

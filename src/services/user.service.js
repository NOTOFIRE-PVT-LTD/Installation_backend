const userRepository = require('../repositories/user.repository');
const permissionRepository = require('../repositories/permission.repository');
const refreshTokenRepository = require('../repositories/refreshToken.repository');
const permissionService = require('./permission.service');
const authService = require('./auth.service');
const emailService = require('./email.service');
const uploadService = require('./upload.service');
const tokenService = require('./token.service');
const ApiError = require('../utils/ApiError');
const { buildPagination, buildSort, buildPaginatedResult } = require('../utils/pagination');
const { rejectIfPasswordReused } = require('../utils/passwordReuse');
const { ROLES, USER_STATUS, ADMIN_TYPES, JOB_ROLES, GENDER, PERMISSION_KEYS } = require('../config/constants');
const {
  isSuperAdmin,
  isLockedSuperAdmin,
  isPlatformOwner,
  canSetPassword,
  actorHasApp,
  defaultUserPermissions,
  adminTypeForApp,
  permissionsForApp,
} = require('../utils/roles');

const ALLOWED_SORT_FIELDS = ['name', 'email', 'role', 'status', 'createdAt'];

async function list(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS);

  const filter = {};
  if (query.role === ADMIN_TYPES.SUPER_ADMIN || query.adminType === ADMIN_TYPES.SUPER_ADMIN) {
    filter.role = ROLES.ADMIN;
    filter.adminType = ADMIN_TYPES.SUPER_ADMIN;
  } else if (query.role) {
    filter.role = query.role;
    if (query.role === ROLES.ADMIN) {
      filter.adminType = { $ne: ADMIN_TYPES.SUPER_ADMIN };
    }
  }
  if (query.adminType && query.adminType !== ADMIN_TYPES.SUPER_ADMIN) filter.adminType = query.adminType;
  if (query.jobRole) filter.jobRole = query.jobRole;
  if (query.status) filter.status = query.status;

  const searchOr = query.search
    ? [
        { name: new RegExp(query.search, 'i') },
        { email: new RegExp(query.search, 'i') },
        { mobileNumber: new RegExp(query.search, 'i') },
      ]
    : null;

  if (query.scope === 'attendance' || query.scope === 'tracking') {
    delete filter.role;
    delete filter.jobRole;
    delete filter.adminType;
    const scopeOr = [
      { role: ROLES.USER, jobRole: JOB_ROLES.SALESPERSON },
      { role: ROLES.ADMIN, adminType: ADMIN_TYPES.SALES_COORDINATOR },
    ];
    if (searchOr) {
      filter.$and = [{ $or: scopeOr }, { $or: searchOr }];
    } else {
      filter.$or = scopeOr;
    }
  } else if (searchOr) {
    filter.$or = searchOr;
  }

  if (query.apps) {
    const keys = String(query.apps)
      .split(',')
      .map((key) => key.trim())
      .filter((key) => PERMISSION_KEYS.includes(key));
    if (keys.length) {
      const permOr = keys.map((key) => ({ [key]: true }));
      if (keys.includes('attendance')) permOr.push({ salespersonTracking: true });
      const permDocs = await permissionRepository.find({ $or: permOr }, { select: 'user' });
      const userIds = permDocs.map((doc) => doc.user).filter(Boolean);
      const appsOr = [{ _id: { $in: userIds } }, { adminType: ADMIN_TYPES.SUPER_ADMIN }];
      if (keys.includes('complaints')) appsOr.push({ adminType: ADMIN_TYPES.COMPLAINT_COORDINATOR });
      if (keys.includes('attendance')) {
        appsOr.push({ jobRole: JOB_ROLES.SALESPERSON });
        appsOr.push({ adminType: ADMIN_TYPES.SALES_COORDINATOR });
      }
      if (keys.includes('tenders')) appsOr.push({ adminType: ADMIN_TYPES.TENDER_COORDINATOR });
      const appsClause = { $or: appsOr };
      if (filter.$and) {
        filter.$and.push(appsClause);
      } else if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, appsClause];
        delete filter.$or;
      } else {
        filter.$or = appsOr;
      }
    }
  }

  const { items, total } = await userRepository.paginate({
    filter,
    sort,
    skip,
    limit: pageSize,
    populate: 'permissions',
  });

  return buildPaginatedResult({
    items: items.map((u) => u.toSafeObject()),
    total,
    page,
    pageSize,
  });
}

async function getById(id) {
  const user = await userRepository.findByIdWithPermissions(id);
  if (!user) throw new ApiError(404, 'User not found');
  return user.toSafeObject();
}

async function create(data, file, actor) {
  const actorId = actor?._id || actor;
  const actorDoc = actor?.role ? actor : await userRepository.findByIdWithPermissions(actorId);
  const accountLevel = data.accountLevel || (data.role === ROLES.USER ? 'USER' : 'ADMIN');
  const appAccess = data.appAccess || (data.adminType === ADMIN_TYPES.SUPER_ADMIN ? 'ALL' : '');
  const wantsGlobalSuper = accountLevel === 'SUPER_ADMIN' && (appAccess === 'ALL' || data.adminType === ADMIN_TYPES.SUPER_ADMIN);

  let role = data.role;
  let adminType = data.adminType;
  let appSuperAdmin = false;
  let permissionMap = null;
  let grantAll = false;

  if (accountLevel === 'USER' || role === ROLES.USER) {
    role = ROLES.USER;
    adminType = undefined;
    appSuperAdmin = false;
    permissionMap = defaultUserPermissions(data.jobRole, data.appAccess);
  } else {
    role = ROLES.ADMIN;
    if (actorDoc?.role !== ROLES.ADMIN) {
      throw new ApiError(403, 'Only an Admin can create Admin accounts');
    }
    const actorIsGlobalSuper = isSuperAdmin(actorDoc);
    const actorIsAppSuper = Boolean(actorDoc?.appSuperAdmin);

    if (wantsGlobalSuper) {
      if (!isPlatformOwner(actorDoc)) {
        throw new ApiError(403, 'Only Gaurav Jain can create a Super Admin with access to all apps');
      }
      adminType = ADMIN_TYPES.SUPER_ADMIN;
      appSuperAdmin = false;
      grantAll = true;
      permissionMap = permissionsForApp('ALL', true);
    } else {
      const scopedApp = appAccess && appAccess !== 'ALL' ? appAccess : null;
      if (!scopedApp) {
        throw new ApiError(400, 'Select an app for this Admin or Super Admin');
      }
      if (!actorHasApp(actorDoc, scopedApp)) {
        throw new ApiError(403, 'You can only create admins for apps you have access to');
      }
      adminType = adminTypeForApp(scopedApp);
      if (actorIsAppSuper && actorDoc.adminType !== adminType) {
        throw new ApiError(403, 'You can only create users for your own app');
      }
      if (accountLevel === 'SUPER_ADMIN' && !actorIsGlobalSuper) {
        throw new ApiError(403, 'Only an all-apps Super Admin can create an app Super Admin');
      }
      appSuperAdmin = accountLevel === 'SUPER_ADMIN';
      permissionMap = permissionsForApp(scopedApp);
    }
  }

  const existing = await userRepository.findOne({ email: data.email.toLowerCase() });
  if (existing) throw new ApiError(409, 'A user with this email already exists');

  let profileImage = { url: null, publicId: null };
  if (file) {
    profileImage = await uploadService.uploadImageBuffer(file.buffer);
  }

  const user = await userRepository.create({
    name: data.name,
    email: data.email,
    password: data.password,
    mobileNumber: data.mobileNumber,
    role,
    adminType: role === ROLES.ADMIN ? adminType : undefined,
    appSuperAdmin,
    jobRole: data.jobRole || (role === ROLES.USER ? JOB_ROLES.INSTALLER : undefined),
    gender: Object.values(GENDER).includes(data.gender) ? data.gender : GENDER.MALE,
    profileImage,
    createdBy: actorId,
    updatedBy: actorId,
  });

  const permission = await permissionService.createDefaultPermissions(user._id, {
    actorId,
    grantAll,
  });
  user.permissions = permission._id;
  let parsed = data.permissions;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { parsed = {}; }
  }
  if (!parsed || typeof parsed !== 'object') parsed = {};
  const merged = { ...(permissionMap || {}), ...parsed };
  if (Object.keys(merged).length) {
    await permissionService.updatePermissions(user._id, merged, actorId);
  }
  await user.save();

  await emailService.sendWelcomeEmail(user, data.password);

  return getById(user._id);
}

async function update(id, data, file, actorId) {
  const user = await userRepository.findById(id);
  if (!user) throw new ApiError(404, 'User not found');
  if (isLockedSuperAdmin(user) && data.adminType && data.adminType !== ADMIN_TYPES.SUPER_ADMIN) {
    throw new ApiError(403, 'Super Admin role cannot be changed');
  }

  const updates = { updatedBy: actorId };
  ['name', 'mobileNumber', 'adminType', 'jobRole', 'gender'].forEach((field) => {
    if (data[field] !== undefined) updates[field] = data[field];
  });

  if (data.role && data.role !== user.role) {
    updates.role = data.role;
    if (data.role === ROLES.ADMIN && !user.permissions) {
      const permission = await permissionService.createDefaultPermissions(user._id, { actorId });
      updates.permissions = permission._id;
    }
  }

  if (data.permissions) {
    let parsed = data.permissions;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch { parsed = {}; }
    }
    if (!user.permissions) {
      const permission = await permissionService.createDefaultPermissions(user._id, { actorId });
      updates.permissions = permission._id;
    }
    await permissionService.updatePermissions(user._id, parsed, actorId);
  }

  if (file) {
    if (user.profileImage?.publicId) {
      await uploadService.deleteAsset(user.profileImage.publicId, 'image');
    }
    updates.profileImage = await uploadService.uploadImageBuffer(file.buffer);
  } else if (data.removeProfileImage === 'true' || data.removeProfileImage === true) {
    if (user.profileImage?.publicId) {
      await uploadService.deleteAsset(user.profileImage.publicId, 'image');
    }
    updates.profileImage = { url: null, publicId: null };
  }

  await userRepository.updateById(id, updates);
  return getById(id);
}

async function remove(id) {
  const user = await userRepository.findById(id);
  if (!user) throw new ApiError(404, 'User not found');
  if (isLockedSuperAdmin(user)) {
    throw new ApiError(403, 'Super Admin accounts cannot be deleted');
  }

  if (user.profileImage?.publicId) {
    await uploadService.deleteAsset(user.profileImage.publicId, 'image');
  }
  if (user.permissions) {
    await permissionRepository.deleteById(user.permissions);
  }
  await refreshTokenRepository.revokeAllForUser(user._id);
  await userRepository.deleteById(id);
  return { _id: user._id, name: user.name, email: user.email };
}

async function updateStatus(id, status, actorId) {
  const user = await userRepository.updateById(id, { status, updatedBy: actorId });
  if (!user) throw new ApiError(404, 'User not found');
  if (status === 'inactive') {
    await refreshTokenRepository.revokeAllForUser(id);
  }
  return getById(id);
}

async function triggerPasswordReset(id, actor) {
  const user = await userRepository.findById(id);
  if (!user) throw new ApiError(404, 'User not found');
  if (!canSetPassword(actor, user)) {
    throw new ApiError(403, 'You can only change your own Super Admin password');
  }
  await authService.forgotPassword(user.email);
}

async function setPassword(id, newPassword, actor) {
  const user = await userRepository.findByIdWithPassword(id);
  if (!user) throw new ApiError(404, 'User not found');
  if (!canSetPassword(actor, user)) {
    throw new ApiError(403, 'You can only change your own Super Admin password');
  }

  await rejectIfPasswordReused(user, newPassword);

  // Use the model's password setter so the pre-save hook hashes it.
  // validateModifiedOnly: Gaurav's row has an empty mobile and full validation would fail.
  user.password = newPassword;
  await user.save({ validateModifiedOnly: true });

  // Revoke all active sessions so they must re-login with the new password
  await refreshTokenRepository.revokeAllForUser(user._id);

  await emailService.sendPasswordChangedEmail(user);
}

async function updatePermissions(id, updates, actorId) {
  const user = await userRepository.findById(id);
  if (!user) throw new ApiError(404, 'User not found');
  if (isLockedSuperAdmin(user)) {
    throw new ApiError(403, 'Super Admin already has access to every app');
  }

  const keys = user.role === ROLES.ADMIN ? undefined : permissionService.INSTALLER_PERMISSION_KEYS;
  await permissionService.updatePermissions(id, updates, actorId, keys);

  if (user.role !== ROLES.ADMIN && !user.permissions) {
    const permission = await permissionRepository.findByUser(id);
    await userRepository.updateById(id, { permissions: permission._id });
  }

  return getById(id);
}

async function impersonate(id) {
  const user = await userRepository.findByIdWithPermissions(id);
  if (!user) throw new ApiError(404, 'User not found');
  if (user.status === USER_STATUS.INACTIVE) {
    throw new ApiError(400, 'Cannot log in as a deactivated user');
  }

  const accessToken = tokenService.signAccessToken(user);

  return {
    user: user.toSafeObject(),
    permissions: permissionService.serializePermissions(user),
    accessToken,
  };
}

async function updateOwnProfile(userId, data, file) {
  const user = await userRepository.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');

  const updates = {};
  ['name', 'mobileNumber'].forEach((field) => {
    if (data[field] !== undefined) updates[field] = data[field];
  });

  if (file) {
    if (user.profileImage?.publicId) {
      await uploadService.deleteAsset(user.profileImage.publicId, 'image');
    }
    updates.profileImage = await uploadService.uploadImageBuffer(file.buffer);
  } else if (data.removeProfileImage === 'true' || data.removeProfileImage === true) {
    if (user.profileImage?.publicId) {
      await uploadService.deleteAsset(user.profileImage.publicId, 'image');
    }
    updates.profileImage = { url: null, publicId: null };
  }

  await userRepository.updateById(userId, updates);
  return getById(userId);
}

async function listForDropdown() {
  return userRepository.find(
    { status: USER_STATUS.ACTIVE, role: ROLES.USER, jobRole: JOB_ROLES.SALESPERSON },
    { select: 'name email mobileNumber jobRole', sort: { name: 1 } }
  );
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  updateStatus,
  triggerPasswordReset,
  setPassword,
  updatePermissions,
  updateOwnProfile,
  impersonate,
  listForDropdown,
};

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
const { ROLES, USER_STATUS } = require('../config/constants');

const ALLOWED_SORT_FIELDS = ['name', 'email', 'role', 'status', 'createdAt'];

async function list(query) {
  const { page, pageSize, skip } = buildPagination(query);
  const sort = buildSort(query, ALLOWED_SORT_FIELDS);

  const filter = {};
  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;
  if (query.search) {
    const regex = new RegExp(query.search, 'i');
    filter.$or = [{ name: regex }, { email: regex }, { mobileNumber: regex }];
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

async function create(data, file, actorId) {
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
    role: data.role,
    profileImage,
    createdBy: actorId,
    updatedBy: actorId,
  });

  if (user.role === ROLES.ADMIN) {
    const permission = await permissionService.createDefaultPermissions(user._id, { actorId });
    user.permissions = permission._id;
    await user.save();
  }

  await emailService.sendWelcomeEmail(user, data.password);

  return getById(user._id);
}

async function update(id, data, file, actorId) {
  const user = await userRepository.findById(id);
  if (!user) throw new ApiError(404, 'User not found');

  const updates = { updatedBy: actorId };
  ['name', 'mobileNumber'].forEach((field) => {
    if (data[field] !== undefined) updates[field] = data[field];
  });

  if (data.role && data.role !== user.role) {
    updates.role = data.role;
    if (data.role === ROLES.ADMIN && !user.permissions) {
      const permission = await permissionService.createDefaultPermissions(user._id, { actorId });
      updates.permissions = permission._id;
    }
  }

  if (file) {
    if (user.profileImage?.publicId) {
      await uploadService.deleteAsset(user.profileImage.publicId, 'image');
    }
    updates.profileImage = await uploadService.uploadImageBuffer(file.buffer);
  }

  await userRepository.updateById(id, updates);
  return getById(id);
}

async function remove(id) {
  const user = await userRepository.findById(id);
  if (!user) throw new ApiError(404, 'User not found');

  if (user.profileImage?.publicId) {
    await uploadService.deleteAsset(user.profileImage.publicId, 'image');
  }
  if (user.permissions) {
    await permissionRepository.deleteById(user.permissions);
  }
  await refreshTokenRepository.revokeAllForUser(user._id);
  await userRepository.deleteById(id);
}

async function updateStatus(id, status, actorId) {
  const user = await userRepository.updateById(id, { status, updatedBy: actorId });
  if (!user) throw new ApiError(404, 'User not found');
  if (status === 'inactive') {
    await refreshTokenRepository.revokeAllForUser(id);
  }
  return getById(id);
}

async function triggerPasswordReset(id) {
  const user = await userRepository.findById(id);
  if (!user) throw new ApiError(404, 'User not found');
  await authService.forgotPassword(user.email);
}

async function updatePermissions(id, updates, actorId) {
  const user = await userRepository.findById(id);
  if (!user) throw new ApiError(404, 'User not found');

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
  }

  await userRepository.updateById(userId, updates);
  return getById(userId);
}

async function listForDropdown() {
  return userRepository.find(
    { status: USER_STATUS.ACTIVE, role: ROLES.USER },
    { select: 'name email mobileNumber', sort: { name: 1 } }
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
  updatePermissions,
  updateOwnProfile,
  impersonate,
  listForDropdown,
};

const userService = require('./user.service');
const userRepository = require('../repositories/user.repository');
const ApiError = require('../utils/ApiError');
const { ROLES, USER_STATUS, JOB_ROLES, ADMIN_TYPES } = require('../config/constants');

const SALESPERSON_PERMS = {
  customers: true,
  attendance: true,
  projects: false,
  reports: false,
  cadDrawing: false,
  atlantaPayments: false,
};

async function list(query) {
  if (query.role === ROLES.USER) {
    return userService.list({ ...query, role: ROLES.USER, jobRole: JOB_ROLES.SALESPERSON });
  }
  if (query.role === ROLES.ADMIN) {
    return userService.list({ ...query, role: ROLES.ADMIN, adminType: ADMIN_TYPES.SALES_COORDINATOR });
  }
  return userService.list({ ...query, scope: 'attendance' });
}

async function create(data, actor) {
  if (data.role === ROLES.ADMIN) {
    return userService.create(
      {
        ...data,
        role: ROLES.ADMIN,
        adminType: data.adminType || ADMIN_TYPES.SALES_COORDINATOR,
        permissions: { salespersonTracking: true, customers: true, attendance: true },
      },
      null,
      actor
    );
  }
  return userService.create(
    { ...data, role: ROLES.USER, jobRole: JOB_ROLES.SALESPERSON, permissions: SALESPERSON_PERMS },
    null,
    actor
  );
}

async function update(id, data, actorId) {
  const user = await userRepository.findById(id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  return userService.update(id, data, null, actorId);
}

async function updateStatus(id, status, actorId) {
  const user = await userRepository.findById(id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  if (!Object.values(USER_STATUS).includes(status)) throw new ApiError(400, 'Invalid status');
  return userService.updateStatus(id, status, actorId);
}

module.exports = { list, create, update, updateStatus };

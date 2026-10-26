const userService = require('./user.service');
const userRepository = require('../repositories/user.repository');
const ApiError = require('../utils/ApiError');
const { ROLES, USER_STATUS, JOB_ROLES } = require('../config/constants');

const SALESPERSON_PERMS = {
  customers: true,
  attendance: true,
  projects: false,
  reports: false,
  cadDrawing: false,
  atlantaPayments: false,
};

async function list(query) {
  return userService.list({ ...query, role: ROLES.USER, jobRole: JOB_ROLES.SALESPERSON });
}

async function create(data, actor) {
  return userService.create(
    { ...data, role: ROLES.USER, jobRole: JOB_ROLES.SALESPERSON, permissions: SALESPERSON_PERMS },
    null,
    actor
  );
}

async function update(id, data, actorId) {
  const user = await userRepository.findById(id);
  if (!user || user.role !== ROLES.USER || user.jobRole !== JOB_ROLES.SALESPERSON) {
    throw new ApiError(404, 'Salesperson not found');
  }
  return userService.update(id, { ...data, role: ROLES.USER, jobRole: JOB_ROLES.SALESPERSON }, null, actorId);
}

async function updateStatus(id, status, actorId) {
  const user = await userRepository.findById(id);
  if (!user || user.role !== ROLES.USER || user.jobRole !== JOB_ROLES.SALESPERSON) {
    throw new ApiError(404, 'Salesperson not found');
  }
  if (!Object.values(USER_STATUS).includes(status)) throw new ApiError(400, 'Invalid status');
  return userService.updateStatus(id, status, actorId);
}

module.exports = { list, create, update, updateStatus };

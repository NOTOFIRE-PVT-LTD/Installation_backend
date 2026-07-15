const userService = require('../services/user.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await userService.list(req.query);
  sendSuccess(res, { message: 'Users fetched', data: result.items, meta: result });
});

const options = asyncHandler(async (req, res) => {
  const users = await userService.listForDropdown();
  sendSuccess(res, {
    message: 'Users fetched',
    data: users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      mobileNumber: u.mobileNumber,
    })),
  });
});

const getById = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  sendSuccess(res, { message: 'User fetched', data: user });
});

const create = asyncHandler(async (req, res) => {
  const user = await userService.create(req.body, req.file, req.user._id);
  sendSuccess(res, { statusCode: 201, message: 'User created', data: user });
});

const update = asyncHandler(async (req, res) => {
  const user = await userService.update(req.params.id, req.body, req.file, req.user._id);
  sendSuccess(res, { message: 'User updated', data: user });
});

const remove = asyncHandler(async (req, res) => {
  await userService.remove(req.params.id);
  sendSuccess(res, { message: 'User deleted' });
});

const updateStatus = asyncHandler(async (req, res) => {
  const user = await userService.updateStatus(req.params.id, req.body.status, req.user._id);
  sendSuccess(res, { message: 'User status updated', data: user });
});

const resetPassword = asyncHandler(async (req, res) => {
  await userService.triggerPasswordReset(req.params.id);
  sendSuccess(res, { message: 'Password reset email has been sent to the user' });
});

const updatePermissions = asyncHandler(async (req, res) => {
  const user = await userService.updatePermissions(req.params.id, req.body, req.user._id);
  sendSuccess(res, { message: 'Permissions updated', data: user });
});

const impersonate = asyncHandler(async (req, res) => {
  const result = await userService.impersonate(req.params.id);
  sendSuccess(res, { message: `Logged in as ${result.user.name}`, data: result });
});

module.exports = { list, options, getById, create, update, remove, updateStatus, resetPassword, updatePermissions, impersonate };

const searchService = require('../services/search.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const { isSuperAdmin } = require('../utils/roles');

const search = asyncHandler(async (req, res) => {
  if (!isSuperAdmin(req.user)) {
    throw new ApiError(403, 'Search is only available to Super Admin');
  }
  const data = await searchService.search(req.query, req.user);
  sendSuccess(res, { message: 'Search results fetched', data });
});

module.exports = { search };

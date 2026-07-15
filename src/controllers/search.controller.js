const searchService = require('../services/search.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const search = asyncHandler(async (req, res) => {
  const data = await searchService.search(req.query, req.user);
  sendSuccess(res, { message: 'Search results fetched', data });
});

module.exports = { search };

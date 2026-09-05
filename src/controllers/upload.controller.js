const uploadService = require('../services/upload.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const cloudinarySign = asyncHandler(async (req, res) => {
  const resourceType = req.body.resourceType === 'video' ? 'video' : 'image';
  const data = uploadService.getUploadSignature({ resourceType });
  sendSuccess(res, { message: 'Cloudinary upload signature created', data });
});

module.exports = { cloudinarySign };

const uploadService = require('../services/upload.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const cloudinarySign = asyncHandler(async (req, res) => {
  const allowedTypes = ['image', 'video', 'document', 'cadImage', 'cadDocument'];
  const resourceType = allowedTypes.includes(req.body.resourceType) ? req.body.resourceType : 'image';
  const data = uploadService.getUploadSignature({ resourceType });
  sendSuccess(res, { message: 'Cloudinary upload signature created', data });
});

module.exports = { cloudinarySign };

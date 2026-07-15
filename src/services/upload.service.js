const cloudinary = require('../config/cloudinary');
const env = require('../config/env');

function uploadBuffer(buffer, { folder, resourceType }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

function uploadImageBuffer(buffer) {
  return uploadBuffer(buffer, { folder: env.cloudinary.imageFolder, resourceType: 'image' });
}

function uploadVideoBuffer(buffer) {
  return uploadBuffer(buffer, { folder: env.cloudinary.videoFolder, resourceType: 'video' });
}

function uploadDocumentBuffer(buffer) {
  return uploadBuffer(buffer, { folder: env.cloudinary.documentFolder, resourceType: 'raw' });
}

// Tender attachments may be either an image or a PDF; pick the Cloudinary resource_type by mimetype.
async function uploadCadFile(file) {
  const resourceType = file.mimetype === 'application/pdf' ? 'raw' : 'image';
  const result = await uploadBuffer(file.buffer, { folder: env.cloudinary.cadFolder, resourceType });
  return { ...result, resourceType, originalName: file.originalname };
}

async function deleteAsset(publicId, resourceType = 'image') {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    // Non-fatal: log and continue, do not block the primary operation on cleanup failure
    // eslint-disable-next-line no-console
    console.warn('[upload] Failed to delete Cloudinary asset:', publicId, err.message);
  }
}

module.exports = { uploadImageBuffer, uploadVideoBuffer, uploadDocumentBuffer, uploadCadFile, deleteAsset };
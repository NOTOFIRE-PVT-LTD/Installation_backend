const multer = require('multer');
const env = require('../config/env');

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const DOCUMENT_MIME_TYPES = ['application/pdf'];

const VIDEO_FIELDS = ['siteVideo', 'commissioningVideos', 'videos'];
const DOCUMENT_FIELDS = ['checklistPdf', 'installationInvoiceDoc', 'supplyInvoiceDoc', 'installationPoDoc', 'checklistFile', 'checklistSignedFile'];
const MIXED_FIELDS = ['tenderFiles', 'cadDrawingFile', 'cadDrawingFiles'];
const MIXED_MIME_TYPES = [...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES];

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (VIDEO_FIELDS.includes(file.fieldname)) {
    if (!VIDEO_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only mp4, mov, or webm videos are allowed'));
    }
  } else if (DOCUMENT_FIELDS.includes(file.fieldname)) {
    if (!DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only PDF files are allowed'));
    }
  } else if (MIXED_FIELDS.includes(file.fieldname)) {
    if (!MIXED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only jpeg, png, webp images or PDF files are allowed'));
    }
  } else {
    if (!IMAGE_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only jpeg, png, or webp images are allowed'));
    }
  }
  cb(null, true);
}

const maxSizeBytes = Math.max(env.upload.maxImageSizeMb, env.upload.maxVideoSizeMb) * 1024 * 1024;

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxSizeBytes },
});

const uploadReportFiles = upload.fields([
  { name: 'sitePhotos', maxCount: 10 },
  { name: 'siteVideo', maxCount: 1 },
]);

const uploadProfileImage = upload.single('profileImage');

const uploadProjectFiles = upload.fields([
  { name: 'checklistPdf', maxCount: 1 },
  { name: 'commissioningVideos', maxCount: 10 },
  { name: 'installationInvoiceDoc', maxCount: 1 },
  { name: 'supplyInvoiceDoc', maxCount: 1 },
  { name: 'installationPoDoc', maxCount: 1 },
]);

const SPREADSHEET_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
];

const uploadSpreadsheet = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!SPREADSHEET_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only .xlsx, .xls, or .csv files are allowed'));
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('file');

const uploadTenderFiles = upload.array('tenderFiles', 20);

const uploadStationPhotos = upload.fields([
  { name: 'completePhotos', maxCount: 10 },
  { name: 'remainingPhotos', maxCount: 10 },
  { name: 'workPhotos', maxCount: 20 },
  { name: 'checklistFile', maxCount: 1 },
  { name: 'checklistSignedFile', maxCount: 1 },
  { name: 'cadDrawingFile', maxCount: 1 },
  { name: 'cadDrawingFiles', maxCount: 20 },
]);

const uploadDailyReportMedia = upload.fields([
  { name: 'photos', maxCount: 10 },
  { name: 'videos', maxCount: 5 },
]);

module.exports = {
  uploadReportFiles,
  uploadProfileImage,
  uploadProjectFiles,
  uploadSpreadsheet,
  uploadTenderFiles,
  uploadStationPhotos,
  uploadDailyReportPhotos: uploadDailyReportMedia,
  uploadDailyReportMedia,
};

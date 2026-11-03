const express = require('express');
const complaintController = require('../controllers/complaint.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const complaintRateLimit = require('../middlewares/complaintRateLimit.middleware');
const { uploadComplaintPhotos } = require('../middlewares/upload.middleware');

const router = express.Router();

// Public: Customers submit via web QR or track their complaint without logging in
router.post(
  '/public',
  complaintRateLimit,
  uploadComplaintPhotos,
  complaintController.publicCreate
);
router.post(
  '/public/submit',
  complaintRateLimit,
  uploadComplaintPhotos,
  complaintController.publicCreate
);
router.get(
  '/public/track',
  complaintController.publicTrack
);

// Protected Staff routes: Authenticated users (Admin, Coordinators, Field Engineers)
router.use(authenticate);

router.get('/dashboard', complaintController.dashboardMetrics);
router.get('/stats', complaintController.dashboardMetrics);
router.get('/check-duplicate', complaintController.checkDuplicate);
router.get('/assignees', complaintController.assignees);

router.get('/', complaintController.list);
router.post('/', complaintController.createInternal);

router.get('/:id', complaintController.getById);
router.patch('/:id', complaintController.update);

router.post('/:id/acknowledge', complaintController.acknowledge);
router.post('/:id/assign', complaintController.assign);
router.post('/:id/status', complaintController.updateStatus);
router.patch('/:id/status', complaintController.updateStatus);
router.post('/:id/work-logs', complaintController.addWorkLog);
router.post('/:id/resolve', complaintController.resolve);
router.post('/:id/reopen', complaintController.reopen);
router.post('/:id/comments', complaintController.addComment);

module.exports = router;

const express = require('express');
const contractorAttendanceController = require('../controllers/contractorAttendance.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { uploadSpreadsheet } = require('../middlewares/upload.middleware');

const router = express.Router();

router.use(authenticate);

// Template download
router.get('/template', contractorAttendanceController.downloadTemplate);

// List contractor attendance records + summary stats
router.get('/', contractorAttendanceController.list);

// Upload Excel attendance file and extract data
router.post('/upload', uploadSpreadsheet, contractorAttendanceController.uploadExcel);

// Delete record by ID
router.delete('/:id', contractorAttendanceController.deleteRecord);

// Delete batch by batchId
router.delete('/batch/:batchId', contractorAttendanceController.deleteBatch);

module.exports = router;


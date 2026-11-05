const contractorAttendanceService = require('../services/contractorAttendance.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const list = asyncHandler(async (req, res) => {
  const result = await contractorAttendanceService.list(req.query);
  sendSuccess(res, {
    message: 'Contractor attendance fetched',
    data: result.items,
    meta: {
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    },
    summary: result.summary,
    filterOptions: result.filterOptions,
  });
});

const uploadExcel = asyncHandler(async (req, res) => {
  const result = await contractorAttendanceService.uploadExcel(req.file, req.user, req.body);
  sendSuccess(res, {
    statusCode: 201,
    message: `Successfully extracted and saved ${result.insertedCount} contractor attendance records`,
    data: result,
  });
});

const downloadTemplate = asyncHandler(async (req, res) => {
  await contractorAttendanceService.generateSampleTemplate(res);
});

const deleteRecord = asyncHandler(async (req, res) => {
  await contractorAttendanceService.deleteRecord(req.params.id);
  sendSuccess(res, { message: 'Attendance record deleted' });
});

const deleteBatch = asyncHandler(async (req, res) => {
  const result = await contractorAttendanceService.deleteBatch(req.params.batchId);
  sendSuccess(res, { message: `Deleted ${result.deletedCount} records for batch ${req.params.batchId}` });
});

module.exports = {
  list,
  uploadExcel,
  downloadTemplate,
  deleteRecord,
  deleteBatch,
};


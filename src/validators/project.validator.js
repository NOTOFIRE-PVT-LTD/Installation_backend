const { body, param, query } = require('express-validator');

const numberFields = ['cableUsed', 'asdUsed', 'lhdUsed', 'noOfDevices', 'amountFixWithContractor', 'amountFixWithInstaller', 'amountReceivedFromContractor', 'amountPaidToInstaller', 'balancePayment', 'totalInstallationAmount'];

const dateFields = ['installationStartDate', 'installationEndDate', 'dateOfCommissioning', 'dateOfPayment', 'loaDate', 'dateOfCompletionLOA', 'targetDate'];

const textFields = ['invoiceNoDateSupply', 'installationInvoice', 'loaNo', 'workName', 'reasonForDelay', 'supervisorName'];

const jsonFields = ['totalUnits', 'loaItems', 'railwayOfficers', 'additionalOfficers', 'notofireContact', 'installerRatings'];

const create = [
  body('projectName').trim().notEmpty().withMessage('Project name is required'),
  body('assignedInstaller').isMongoId().withMessage('Assigned installer is required'),
  body('contractor').trim().notEmpty().withMessage('Contractor is required'),
  body('railwayZone').trim().notEmpty().withMessage('Railway zone is required'),
  body('serialType').optional().isIn(['Panel Serial No.', 'LHS', 'AHD']).withMessage('Invalid serial type'),
  body('panelSerialStart').optional().trim(),
  body('panelSerialEnd').optional().trim(),
  body('panelSerialNo').optional().trim(),
  ...textFields.map((field) => body(field).optional().trim()),
  ...numberFields.map((field) => body(field).optional().isFloat({ min: 0 }).withMessage(`${field} must be a positive number`)),
  ...dateFields.map((field) => body(field).optional({ checkFalsy: true }).isISO8601().withMessage(`${field} must be a valid date`)),
  ...jsonFields.map((field) => body(field).optional()),
  body('checklistReceived').optional().isBoolean().toBoolean(),
  body('bonusPercentOverride').optional({ checkFalsy: true }).isFloat({ min: 0, max: 100 }),
];

const update = [
  param('id').isMongoId().withMessage('Invalid project id'),
  body('projectName').optional().trim().notEmpty(),
  body('assignedInstaller').optional().isMongoId().withMessage('Invalid assigned installer'),
  body('contractor').optional().trim().notEmpty(),
  body('railwayZone').optional().trim().notEmpty(),
  body('serialType').optional().isIn(['Panel Serial No.', 'LHS', 'AHD']).withMessage('Invalid serial type'),
  body('panelSerialStart').optional().trim(),
  body('panelSerialEnd').optional().trim(),
  body('panelSerialNo').optional().trim().notEmpty(),
  ...textFields.map((field) => body(field).optional().trim()),
  ...numberFields.map((field) => body(field).optional().isFloat({ min: 0 })),
  ...dateFields.map((field) => body(field).optional({ checkFalsy: true }).isISO8601()),
  ...jsonFields.map((field) => body(field).optional()),
  body('checklistReceived').optional().isBoolean().toBoolean(),
  body('bonusPercentOverride').optional({ checkFalsy: true }).isFloat({ min: 0, max: 100 }),
];

const idParam = [param('id').isMongoId().withMessage('Invalid project id')];

const list = [
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 }),
];

const stationIdParam = [
  param('id').isMongoId().withMessage('Invalid project id'),
  param('stationId').isMongoId().withMessage('Invalid station id'),
];

const createStation = [
  param('id').isMongoId().withMessage('Invalid project id'),
  body('name').trim().notEmpty().withMessage('Station name is required'),
  body('type').optional().trim(),
  body('installationAmount').optional().isFloat({ min: 0 }),
];

const stationTextFields = ['type', 'reasonForDelay', 'remarks'];
const stationNumberFields = ['installationAmount', 'amountClaimed', 'amountCleared'];
const stationDateFields = ['startDate', 'completionDate', 'commissioningDate', 'claimDate'];
const stationJsonFields = ['sse', 'installer', 'supervisor', 'materials', 'claimRequests'];

const updateStation = [
  param('id').isMongoId().withMessage('Invalid project id'),
  param('stationId').isMongoId().withMessage('Invalid station id'),
  body('name').optional().trim().notEmpty(),
  ...stationTextFields.map((field) => body(field).optional().trim()),
  ...stationNumberFields.map((field) => body(field).optional().isFloat({ min: 0 })),
  ...stationDateFields.map((field) => body(field).optional({ checkFalsy: true }).isISO8601()),
  ...stationJsonFields.map((field) => body(field).optional()),
];

const dailyReportIdParam = [
  param('id').isMongoId().withMessage('Invalid project id'),
  param('reportId').isMongoId().withMessage('Invalid daily report id'),
];

const createDailyReport = [
  param('id').isMongoId().withMessage('Invalid project id'),
  body('comment').optional().trim(),
  body('issue').optional().trim(),
];

const stationDailyReportIdParam = [
  param('id').isMongoId().withMessage('Invalid project id'),
  param('stationId').isMongoId().withMessage('Invalid station id'),
  param('reportId').isMongoId().withMessage('Invalid daily report id'),
];

const createStationDailyReport = [
  param('id').isMongoId().withMessage('Invalid project id'),
  param('stationId').isMongoId().withMessage('Invalid station id'),
  body('comment').optional().trim(),
  body('issue').optional().trim(),
];

module.exports = {
  create,
  update,
  idParam,
  list,
  stationIdParam,
  createStation,
  updateStation,
  dailyReportIdParam,
  createDailyReport,
  stationDailyReportIdParam,
  createStationDailyReport,
};

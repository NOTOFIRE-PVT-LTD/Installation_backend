const express = require('express');
const quotationController = require('../controllers/quotation.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const quotationValidator = require('../validators/quotation.validator');
const { ROLES } = require('../config/constants');
const { uploadQuotationProductFiles } = require('../middlewares/upload.middleware');

const ApiError = require('../utils/ApiError');

const router = express.Router();

function denyQuotationUser(action) {
  return (req, _res, next) => {
    if (req.user?.permissions?.quotationsOwnOnly) {
      return next(new ApiError(403, `Quotation users cannot ${action} products, companies, parties or terms`));
    }
    next();
  };
}

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('quotations'));

router.get('/product-options', quotationController.productOptions);

router.get('/products', quotationController.listProducts);
router.get('/products/categories', quotationController.productCategories);
router.post('/products', uploadQuotationProductFiles, quotationController.createProduct);
router.put(
  '/products/:id',
  denyQuotationUser('edit'),
  uploadQuotationProductFiles,
  validate(quotationValidator.idParam),
  quotationController.updateProduct
);
router.delete(
  '/products/:id',
  denyQuotationUser('delete'),
  validate(quotationValidator.idParam),
  quotationController.removeProduct
);

router.get('/masters/:kind', validate(quotationValidator.masterKindParam), quotationController.listMasters);
router.post('/masters/:kind', validate(quotationValidator.masterCreate), quotationController.createMaster);
router.put(
  '/masters/item/:id',
  denyQuotationUser('edit'),
  validate(quotationValidator.masterUpdate),
  quotationController.updateMaster
);
router.delete(
  '/masters/item/:id',
  denyQuotationUser('delete'),
  validate(quotationValidator.idParam),
  quotationController.removeMaster
);

router.get('/', validate(quotationValidator.quotationList), quotationController.listQuotations);
router.post('/', validate(quotationValidator.quotationCreate), quotationController.createQuotation);
router.get('/:id', validate(quotationValidator.idParam), quotationController.getQuotationById);
router.put('/:id', validate(quotationValidator.quotationUpdate), quotationController.updateQuotation);
router.post('/:id/duplicate', validate(quotationValidator.idParam), quotationController.duplicateQuotation);
router.patch('/:id/status', validate(quotationValidator.quotationStatus), quotationController.setStatus);
router.post('/:id/trash', validate(quotationValidator.idParam), quotationController.moveToTrash);
router.post('/:id/restore', validate(quotationValidator.idParam), quotationController.restoreFromTrash);
router.delete('/:id', validate(quotationValidator.idParam), quotationController.deletePermanently);

module.exports = router;

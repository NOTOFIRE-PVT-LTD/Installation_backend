const express = require('express');
const stockController = require('../controllers/stock.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const stockValidator = require('../validators/stock.validator');
const { ROLES } = require('../config/constants');
const { uploadStockItemFiles } = require('../middlewares/upload.middleware');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('stockItems'));

router.get('/catalog', validate(stockValidator.catalogList), stockController.listCatalog);
router.post('/catalog', validate(stockValidator.catalogCreate), stockController.createCatalog);
router.get('/items/options', stockController.itemOptions);
router.get('/summary', stockController.warehouseSummary);
router.get('/items', validate(stockValidator.itemList), stockController.listItems);
router.get('/items/:id', validate(stockValidator.itemIdParam), stockController.getItemById);
router.post('/items', uploadStockItemFiles, validate(stockValidator.itemCreate), stockController.createItem);
router.put('/items/:id', uploadStockItemFiles, validate(stockValidator.itemUpdate), stockController.updateItem);
router.delete('/items/:id', validate(stockValidator.itemIdParam), stockController.removeItem);

router.get('/movements', validate(stockValidator.movementList), stockController.listMovements);
router.post('/movements', validate(stockValidator.movementCreate), stockController.createMovement);
router.delete('/movements/:id', validate(stockValidator.movementIdParam), stockController.removeMovement);

module.exports = router;

const express = require('express');
const itemMasterController = require('../controllers/itemMaster.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const itemMasterValidator = require('../validators/itemMaster.validator');
const { ROLES } = require('../config/constants');
const { uploadMasterItemFiles } = require('../middlewares/upload.middleware');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('itemsMaster'));

router.get('/catalog', validate(itemMasterValidator.catalogList), itemMasterController.listCatalog);
router.post('/catalog', validate(itemMasterValidator.catalogCreate), itemMasterController.createCatalog);
router.delete('/catalog/:id', validate(itemMasterValidator.catalogIdParam), itemMasterController.removeCatalog);

router.get('/items', validate(itemMasterValidator.itemList), itemMasterController.listItems);
router.get('/items/:id', validate(itemMasterValidator.itemIdParam), itemMasterController.getItemById);
router.post(
  '/items',
  uploadMasterItemFiles,
  validate(itemMasterValidator.itemCreate),
  itemMasterController.createItem
);
router.put(
  '/items/:id',
  uploadMasterItemFiles,
  validate(itemMasterValidator.itemUpdate),
  itemMasterController.updateItem
);
router.delete('/items/:id', validate(itemMasterValidator.itemIdParam), itemMasterController.removeItem);

module.exports = router;

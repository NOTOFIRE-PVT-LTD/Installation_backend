const express = require('express');
const nitTenderController = require('../controllers/nitTender.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const nitTenderValidator = require('../validators/nitTender.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN));

// Any admin can pick Tender LOA details when filling a project (no tenders permission required).
router.get('/options', nitTenderController.options);

router.use(requirePermission('tenders'));

router.get('/', validate(nitTenderValidator.list), nitTenderController.list);
router.get('/:id', validate(nitTenderValidator.idParam), nitTenderController.getById);
router.post('/', validate(nitTenderValidator.create), nitTenderController.create);
router.put('/:id', validate(nitTenderValidator.update), nitTenderController.update);
router.delete('/:id', validate(nitTenderValidator.idParam), nitTenderController.remove);

module.exports = router;

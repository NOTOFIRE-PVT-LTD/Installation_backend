const express = require('express');
const callLetterController = require('../controllers/callLetter.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const { requireRole } = require('../middlewares/authorize.middleware');
const { requirePermission } = require('../middlewares/permission.middleware');
const validate = require('../middlewares/validate.middleware');
const callLetterValidator = require('../validators/callLetter.validator');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN), requirePermission('financialDocuments'));

router.get('/', validate(callLetterValidator.list), callLetterController.list);
router.get('/:id', validate(callLetterValidator.idParam), callLetterController.getById);
router.post('/', validate(callLetterValidator.create), callLetterController.create);
router.put('/:id', validate(callLetterValidator.update), callLetterController.update);
router.delete('/:id', validate(callLetterValidator.idParam), callLetterController.remove);

module.exports = router;

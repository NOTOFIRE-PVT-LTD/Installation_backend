const express = require('express');
const searchController = require('../controllers/search.controller');
const authenticate = require('../middlewares/authenticate.middleware');
const validate = require('../middlewares/validate.middleware');
const searchValidator = require('../validators/search.validator');

const router = express.Router();

router.use(authenticate);

router.get('/', validate(searchValidator.search), searchController.search);

module.exports = router;

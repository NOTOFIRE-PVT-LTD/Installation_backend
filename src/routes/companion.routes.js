const express = require('express');
const authenticate = require('../middlewares/authenticate.middleware');
const companionController = require('../controllers/companion.controller');

const router = express.Router();

router.post('/session', authenticate, companionController.createSession);

module.exports = router;

const express = require('express');
const authenticate = require('../middlewares/authenticate.middleware');
const portalController = require('../controllers/portal.controller');

const router = express.Router();

router.post('/upsert-leadtrack-user', portalController.upsertLeadTrackUser);
router.use(authenticate);
router.get('/me', portalController.me);
router.post('/open-pnl', portalController.openPnl);
router.post('/open-leadtrack', portalController.openLeadTrack);
router.get('/directory', portalController.directory);

module.exports = router;
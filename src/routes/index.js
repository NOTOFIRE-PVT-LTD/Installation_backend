const express = require('express');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const projectRoutes = require('./project.routes');
const reportRoutes = require('./report.routes');
const paymentRoutes = require('./payment.routes');
const dashboardRoutes = require('./dashboard.routes');
const numberDirectoryRoutes = require('./numberDirectory.routes');
const divisionRoutes = require('./division.routes');
const tenderRoutes = require('./tender.routes');
const searchRoutes = require('./search.routes');
const whatsappRoutes = require('./whatsapp.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/projects', projectRoutes);
router.use('/reports', reportRoutes);
router.use('/payments', paymentRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/numbers', numberDirectoryRoutes);
router.use('/cad/divisions', divisionRoutes);
router.use('/cad/tenders', tenderRoutes);
router.use('/search', searchRoutes);
router.use('/whatsapp', whatsappRoutes);

module.exports = router;

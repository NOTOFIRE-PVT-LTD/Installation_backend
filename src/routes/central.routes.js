const express = require('express');
const User = require('../models/User.model');
const { sendSuccess } = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');

const router = express.Router();

/**
 * Internal Centralisation directory — P&L portal calls this with SSO_SECRET.
 * Does not create/edit Workspace users; read-only list for the central sidebar.
 */
router.get('/directory-users', async (req, res, next) => {
  try {
    const secret = process.env.SSO_SECRET || process.env.JWT_ACCESS_SECRET;
    // shortcut: shared secret header for portal→API only, rotate via SSO_SECRET when hardening
    if (!secret || req.headers['x-central-secret'] !== secret) {
      throw new ApiError(401, 'Unauthorized');
    }

    const users = await User.find({})
      .select('name email mobileNumber role adminType status')
      .sort({ name: 1 })
      .lean();

    return sendSuccess(res, {
      data: {
        users: users.map((u) => ({
          id: String(u._id),
          name: u.name || null,
          email: u.email,
          phone: u.mobileNumber || null,
          role: u.adminType || u.role || null,
          active: u.status !== 'inactive',
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

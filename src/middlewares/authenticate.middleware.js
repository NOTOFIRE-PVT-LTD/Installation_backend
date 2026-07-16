const tokenService = require('../services/token.service');
const userRepository = require('../repositories/user.repository');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { USER_STATUS } = require('../config/constants');

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) throw new ApiError(401, 'Authentication required');

  let payload;  
  try {
    payload = tokenService.verifyAccessToken(token);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired access token');
  }

  const user = await userRepository.findByIdWithPermissions(payload.sub);
  if (!user) throw new ApiError(401, 'User no longer exists');
  if (user.status === USER_STATUS.INACTIVE) throw new ApiError(403, 'Account deactivated');

  req.user = user;
  next();
});

module.exports = authenticate;

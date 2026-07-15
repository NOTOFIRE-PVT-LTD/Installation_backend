const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

function validate(validations) {
  return async (req, res, next) => {
    await Promise.all(validations.map((validation) => validation.run(req)));

    const result = validationResult(req);
    if (result.isEmpty()) return next();

    const errors = result.array().map((e) => ({ field: e.path, message: e.msg }));
    next(new ApiError(400, 'Validation failed', errors));
  };
}

module.exports = validate;

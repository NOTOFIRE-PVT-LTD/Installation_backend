const { body, param, query } = require('express-validator');
const { PAYFLOW_RESOURCES } = require('../config/payflow.config');

function fieldChains(config) {
  return Object.entries(config.fields).map(([key, spec]) => {
    let chain = body(key).optional({ values: 'undefined' }).trim();
    if (spec.uppercase) chain = chain.customSanitizer((v) => String(v).toUpperCase());
    if (spec.required) chain = chain.notEmpty().withMessage(`${spec.label} is required`);
    if (spec.pattern) {
      chain = chain.if((v) => v !== '').matches(spec.pattern).withMessage(spec.message);
    }
    return chain;
  });
}

// Builds the validator set ({ create, update, idParam, list }) for one Payflow resource.
function buildValidator(resource) {
  const config = PAYFLOW_RESOURCES[resource];
  const idCheck = param('id').isMongoId().withMessage(`Invalid ${config.label.toLowerCase()} id`);
  const requiredFields = Object.entries(config.fields)
    .filter(([, spec]) => spec.required)
    .map(([key, spec]) => body(key).exists({ values: 'falsy' }).withMessage(`${spec.label} is required`));

  return {
    create: [...requiredFields, ...fieldChains(config)],
    update: [idCheck, ...requiredFields, ...fieldChains(config)],
    idParam: [idCheck],
    list: [query('page').optional().isInt({ min: 1 }), query('pageSize').optional().isInt({ min: 1, max: 100 })],
  };
}

module.exports = { buildValidator };

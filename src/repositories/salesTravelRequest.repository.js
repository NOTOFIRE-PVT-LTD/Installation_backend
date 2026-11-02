const BaseRepository = require('./base.repository');
const SalesTravelRequest = require('../models/SalesTravelRequest.model');

class SalesTravelRequestRepository extends BaseRepository {
  constructor() {
    super(SalesTravelRequest);
  }
}

module.exports = new SalesTravelRequestRepository();


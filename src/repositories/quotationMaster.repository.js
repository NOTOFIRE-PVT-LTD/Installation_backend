const BaseRepository = require('./base.repository');
const QuotationMaster = require('../models/QuotationMaster.model');

class QuotationMasterRepository extends BaseRepository {
  constructor() {
    super(QuotationMaster);
  }
}

module.exports = new QuotationMasterRepository();

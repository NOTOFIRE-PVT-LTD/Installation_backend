const BaseRepository = require('./base.repository');
const Quotation = require('../models/Quotation.model');

class QuotationRepository extends BaseRepository {
  constructor() {
    super(Quotation);
  }
}

module.exports = new QuotationRepository();

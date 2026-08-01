const BaseRepository = require('./base.repository');
const FinancialDocument = require('../models/FinancialDocument.model');

class FinancialDocumentRepository extends BaseRepository {
  constructor() {
    super(FinancialDocument);
  }
}

module.exports = new FinancialDocumentRepository();

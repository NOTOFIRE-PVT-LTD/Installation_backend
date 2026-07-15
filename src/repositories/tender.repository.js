const BaseRepository = require('./base.repository');
const Tender = require('../models/Tender.model');

class TenderRepository extends BaseRepository {
  constructor() {
    super(Tender);
  }
}

module.exports = new TenderRepository();

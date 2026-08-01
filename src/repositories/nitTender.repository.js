const BaseRepository = require('./base.repository');
const NitTender = require('../models/NitTender.model');

class NitTenderRepository extends BaseRepository {
  constructor() {
    super(NitTender);
  }
}

module.exports = new NitTenderRepository();

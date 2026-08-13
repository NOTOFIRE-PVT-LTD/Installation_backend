const BaseRepository = require('./base.repository');
const Bom = require('../models/Bom.model');

class BomRepository extends BaseRepository {
  constructor() {
    super(Bom);
  }
}

module.exports = new BomRepository();

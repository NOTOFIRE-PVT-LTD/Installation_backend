const BaseRepository = require('./base.repository');
const BomProduction = require('../models/BomProduction.model');

class BomProductionRepository extends BaseRepository {
  constructor() {
    super(BomProduction);
  }
}

module.exports = new BomProductionRepository();

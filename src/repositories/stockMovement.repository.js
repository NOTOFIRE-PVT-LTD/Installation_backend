const BaseRepository = require('./base.repository');
const StockMovement = require('../models/StockMovement.model');

class StockMovementRepository extends BaseRepository {
  constructor() {
    super(StockMovement);
  }
}

module.exports = new StockMovementRepository();

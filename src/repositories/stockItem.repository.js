const BaseRepository = require('./base.repository');
const StockItem = require('../models/StockItem.model');

class StockItemRepository extends BaseRepository {
  constructor() {
    super(StockItem);
  }
}

module.exports = new StockItemRepository();

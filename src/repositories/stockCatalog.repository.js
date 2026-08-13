const BaseRepository = require('./base.repository');
const StockCatalog = require('../models/StockCatalog.model');

class StockCatalogRepository extends BaseRepository {
  constructor() {
    super(StockCatalog);
  }
}

module.exports = new StockCatalogRepository();

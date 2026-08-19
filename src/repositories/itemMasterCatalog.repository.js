const BaseRepository = require('./base.repository');
const ItemMasterCatalog = require('../models/ItemMasterCatalog.model');

class ItemMasterCatalogRepository extends BaseRepository {
  constructor() {
    super(ItemMasterCatalog);
  }
}

module.exports = new ItemMasterCatalogRepository();

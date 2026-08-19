const BaseRepository = require('./base.repository');
const MasterItem = require('../models/MasterItem.model');

class MasterItemRepository extends BaseRepository {
  constructor() {
    super(MasterItem);
  }
}

module.exports = new MasterItemRepository();

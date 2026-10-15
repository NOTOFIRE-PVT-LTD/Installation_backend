const BaseRepository = require('./base.repository');
const DeliveryChallan = require('../models/DeliveryChallan.model');

class DeliveryChallanRepository extends BaseRepository {
  constructor() {
    super(DeliveryChallan);
  }
}

module.exports = new DeliveryChallanRepository();

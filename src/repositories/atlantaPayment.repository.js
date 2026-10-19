const BaseRepository = require('./base.repository');
const AtlantaPayment = require('../models/AtlantaPayment.model');

class AtlantaPaymentRepository extends BaseRepository {
  constructor() {
    super(AtlantaPayment);
  }
}

module.exports = new AtlantaPaymentRepository();

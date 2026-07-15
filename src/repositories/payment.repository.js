const BaseRepository = require('./base.repository');
const Payment = require('../models/Payment.model');

class PaymentRepository extends BaseRepository {
  constructor() {
    super(Payment);
  }
}

module.exports = new PaymentRepository();

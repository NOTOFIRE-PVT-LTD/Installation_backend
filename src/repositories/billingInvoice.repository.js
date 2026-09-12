const BaseRepository = require('./base.repository');
const BillingInvoice = require('../models/BillingInvoice.model');

class BillingInvoiceRepository extends BaseRepository {
  constructor() {
    super(BillingInvoice);
  }
}

module.exports = new BillingInvoiceRepository();

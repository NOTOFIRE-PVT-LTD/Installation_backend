const BaseRepository = require('./base.repository');
const ProformaInvoice = require('../models/ProformaInvoice.model');

class ProformaInvoiceRepository extends BaseRepository {
  constructor() {
    super(ProformaInvoice);
  }
}

module.exports = new ProformaInvoiceRepository();

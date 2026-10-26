const BaseRepository = require('./base.repository');
const Customer = require('../models/Customer.model');

class CustomerRepository extends BaseRepository {
  constructor() {
    super(Customer);
  }
}

module.exports = new CustomerRepository();

const BaseRepository = require('./base.repository');
const ContractAgreement = require('../models/ContractAgreement.model');

class ContractAgreementRepository extends BaseRepository {
  constructor() {
    super(ContractAgreement);
  }
}

module.exports = new ContractAgreementRepository();

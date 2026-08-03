const BaseRepository = require('./base.repository');
const BgApplication = require('../models/BgApplication.model');

class BgApplicationRepository extends BaseRepository {
  constructor() {
    super(BgApplication);
  }
}

module.exports = new BgApplicationRepository();

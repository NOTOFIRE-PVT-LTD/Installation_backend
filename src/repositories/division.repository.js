const BaseRepository = require('./base.repository');
const Division = require('../models/Division.model');

class DivisionRepository extends BaseRepository {
  constructor() {
    super(Division);
  }
}

module.exports = new DivisionRepository();

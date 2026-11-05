const BaseRepository = require('./base.repository');
const Visit = require('../models/Visit.model');

class VisitRepository extends BaseRepository {
  constructor() {
    super(Visit);
  }
}

module.exports = new VisitRepository();

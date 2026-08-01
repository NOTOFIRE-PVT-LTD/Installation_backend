const BaseRepository = require('./base.repository');
const Inspection = require('../models/Inspection.model');

class InspectionRepository extends BaseRepository {
  constructor() {
    super(Inspection);
  }
}

module.exports = new InspectionRepository();

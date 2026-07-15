const BaseRepository = require('./base.repository');
const Report = require('../models/Report.model');

class ReportRepository extends BaseRepository {
  constructor() {
    super(Report);
  }
}

module.exports = new ReportRepository();

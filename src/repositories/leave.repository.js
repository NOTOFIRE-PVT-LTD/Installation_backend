const BaseRepository = require('./base.repository');
const Leave = require('../models/Leave.model');

class LeaveRepository extends BaseRepository {
  constructor() {
    super(Leave);
  }
}

module.exports = new LeaveRepository();

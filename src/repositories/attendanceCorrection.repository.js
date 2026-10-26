const BaseRepository = require('./base.repository');
const AttendanceCorrection = require('../models/AttendanceCorrection.model');

class AttendanceCorrectionRepository extends BaseRepository {
  constructor() {
    super(AttendanceCorrection);
  }
}

module.exports = new AttendanceCorrectionRepository();

const BaseRepository = require('./base.repository');
const Attendance = require('../models/Attendance.model');

class AttendanceRepository extends BaseRepository {
  constructor() {
    super(Attendance);
  }

  findToday(salespersonId, attendanceDate) {
    return this.model.findOne({ salesperson: salespersonId, attendanceDate });
  }
}

module.exports = new AttendanceRepository();

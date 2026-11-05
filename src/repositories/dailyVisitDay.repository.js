const BaseRepository = require('./base.repository');
const DailyVisitDay = require('../models/DailyVisitDay.model');

class DailyVisitDayRepository extends BaseRepository {
  constructor() {
    super(DailyVisitDay);
  }
}

module.exports = new DailyVisitDayRepository();

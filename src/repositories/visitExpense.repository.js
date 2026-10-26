const BaseRepository = require('./base.repository');
const VisitExpense = require('../models/VisitExpense.model');

class VisitExpenseRepository extends BaseRepository {
  constructor() {
    super(VisitExpense);
  }
}

module.exports = new VisitExpenseRepository();

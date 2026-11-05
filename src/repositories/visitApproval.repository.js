const BaseRepository = require('./base.repository');
const VisitApproval = require('../models/VisitApproval.model');

class VisitApprovalRepository extends BaseRepository {
  constructor() {
    super(VisitApproval);
  }
}

module.exports = new VisitApprovalRepository();

const BaseRepository = require('./base.repository');
const AuditLog = require('../models/AuditLog.model');

class AuditLogRepository extends BaseRepository {
  constructor() {
    super(AuditLog);
  }
}

module.exports = new AuditLogRepository();

const BaseRepository = require('./base.repository');
const Permission = require('../models/Permission.model');

class PermissionRepository extends BaseRepository {
  constructor() {
    super(Permission);
  }

  findByUser(userId) {
    return this.model.findOne({ user: userId });
  }
}

module.exports = new PermissionRepository();

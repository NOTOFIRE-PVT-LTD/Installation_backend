const BaseRepository = require('./base.repository');
const User = require('../models/User.model');

class UserRepository extends BaseRepository {
  constructor() {
    super(User);
  }

  findByEmailWithPassword(email) {
    return this.model
      .findOne({ email: email.toLowerCase() })
      .select('+password')
      .populate('permissions');
  }

  findByIdWithPermissions(id) {
    return this.model.findById(id).populate('permissions');
  }

  findByResetToken(hashedToken) {
    return this.model
      .findOne({ resetPasswordToken: hashedToken, resetPasswordExpires: { $gt: new Date() } })
      .select('+password +resetPasswordToken +resetPasswordExpires');
  }

  findByIdWithPassword(id) {
    return this.model.findById(id).select('+password');
  }
}

module.exports = new UserRepository();

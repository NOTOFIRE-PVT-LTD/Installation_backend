const BaseRepository = require('./base.repository');
const RefreshToken = require('../models/RefreshToken.model');

class RefreshTokenRepository extends BaseRepository {
  constructor() {
    super(RefreshToken);
  }

  findValidByHash(tokenHash) {
    return this.model.findOne({ tokenHash });
  }

  revokeAllForUser(userId) {
    return this.model.updateMany({ user: userId, revoked: false }, { revoked: true });
  }
}

module.exports = new RefreshTokenRepository();

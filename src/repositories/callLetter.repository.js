const BaseRepository = require('./base.repository');
const CallLetter = require('../models/CallLetter.model');

class CallLetterRepository extends BaseRepository {
  constructor() {
    super(CallLetter);
  }
}

module.exports = new CallLetterRepository();

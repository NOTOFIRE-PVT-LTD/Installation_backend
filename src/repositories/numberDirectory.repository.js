const BaseRepository = require('./base.repository');
const NumberDirectory = require('../models/NumberDirectory.model');

class NumberDirectoryRepository extends BaseRepository {
  constructor() {
    super(NumberDirectory);
  }

  findByNumberAndCategory(number, category) {
    return this.model.findOne({ number, category });
  }
}

module.exports = new NumberDirectoryRepository();

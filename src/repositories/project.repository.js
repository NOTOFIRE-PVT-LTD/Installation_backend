const BaseRepository = require('./base.repository');
const Project = require('../models/Project.model');

class ProjectRepository extends BaseRepository {
  constructor() {
    super(Project);
  }
}

module.exports = new ProjectRepository();

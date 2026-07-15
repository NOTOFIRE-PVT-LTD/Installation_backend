class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  create(data) {
    return this.model.create(data);
  }

  findById(id, { populate, select } = {}) {
    let query = this.model.findById(id);
    if (populate) query = query.populate(populate);
    if (select) query = query.select(select);
    return query.exec();
  }

  findOne(filter, { populate, select } = {}) {
    let query = this.model.findOne(filter);
    if (populate) query = query.populate(populate);
    if (select) query = query.select(select);
    return query.exec();
  }

  async paginate({ filter = {}, sort = { createdAt: -1 }, skip = 0, limit = 10, populate }) {
    let query = this.model.find(filter).sort(sort).skip(skip).limit(limit);
    if (populate) query = query.populate(populate);
    const [items, total] = await Promise.all([query.exec(), this.model.countDocuments(filter)]);
    return { items, total };
  }

  updateById(id, update) {
    return this.model.findByIdAndUpdate(id, update, { new: true, runValidators: true });
  }

  deleteById(id) {
    return this.model.findByIdAndDelete(id);
  }

  find(filter = {}, { populate, sort, select } = {}) {
    let query = this.model.find(filter);
    if (populate) query = query.populate(populate);
    if (sort) query = query.sort(sort);
    if (select) query = query.select(select);
    return query.exec();
  }

  countDocuments(filter = {}) {
    return this.model.countDocuments(filter);
  }
}

module.exports = BaseRepository;

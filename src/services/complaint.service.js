const complaintQueryService = require('./complaintQuery.service');
const complaintCreationService = require('./complaintCreation.service');
const complaintWorkflowService = require('./complaintWorkflow.service');

class ComplaintService {
  async list(query = {}, currentUser = null) {
    return complaintQueryService.list(query, currentUser);
  }

  async getById(id) {
    return complaintQueryService.getById(id);
  }

  async getDashboardMetrics(currentUser = null) {
    return complaintQueryService.getDashboardMetrics(currentUser);
  }

  async checkDuplicate({ phone, serialNumber }) {
    return complaintQueryService.checkDuplicate({ phone, serialNumber });
  }

  async getAssignees() {
    return complaintQueryService.getAssignees();
  }

  async publicTrack({ ticketNumber, verification }) {
    return complaintQueryService.publicTrack({ ticketNumber, verification });
  }

  async createPublic(data, files = []) {
    return complaintCreationService.createPublic(data, files);
  }

  async createInternal(data, currentUser) {
    return complaintCreationService.createInternal(data, currentUser);
  }

  async acknowledge(id, currentUser) {
    return complaintWorkflowService.acknowledge(id, currentUser);
  }

  async assign(id, { engineerId, reason }, currentUser) {
    return complaintWorkflowService.assign(id, { engineerId, reason }, currentUser);
  }

  async updateStatus(id, { nextStatus, reason }, currentUser) {
    return complaintWorkflowService.updateStatus(id, { nextStatus, reason }, currentUser);
  }

  async addWorkLog(id, workLogData, currentUser) {
    return complaintWorkflowService.addWorkLog(id, workLogData, currentUser);
  }

  async resolve(id, resolutionData, currentUser) {
    return complaintWorkflowService.resolve(id, resolutionData, currentUser);
  }

  async reopen(id, { reason, reassignToEngineerId }, currentUser) {
    return complaintWorkflowService.reopen(id, { reason, reassignToEngineerId }, currentUser);
  }

  async addComment(id, { content, visibility = 'INTERNAL' }, currentUser) {
    return complaintWorkflowService.addComment(id, { content, visibility }, currentUser);
  }

  async update(id, data, currentUser) {
    return complaintWorkflowService.update(id, data, currentUser);
  }
}

module.exports = new ComplaintService();

const Project = require('../models/Project.model');
const Report = require('../models/Report.model');
const Payment = require('../models/Payment.model');
const { REPORT_STATUS, PAYMENT_STATUS, CLAIM_STATUS, ROLES } = require('../config/constants');

function projectScopeFilter(user) {
  if (user?.role === ROLES.USER) {
    return { assignedInstaller: user._id };
  }
  return {};
}

/**
 * Stage-based work done % for a single station.
 * Stages: Not started → Started → Installation complete → Commissioned → Claim → Paid
 */
function stationWorkDonePct(station) {
  if (!station) return 0;

  if (station.claimStatus === CLAIM_STATUS.PAID) return 100;
  if (station.claimStatus === CLAIM_STATUS.APPROVED) return 90;
  if (station.claimStatus === CLAIM_STATUS.PENDING_APPROVAL) return 80;
  if (station.commissioningDate) return 70;
  if (station.completionDate) return 50;

  if (station.startDate) {
    const done = station.completePhotos?.length || 0;
    const remaining = station.remainingPhotos?.length || 0;
    const total = done + remaining;
    const photoRatio = total > 0 ? done / total : 0;
    return Math.round(20 + photoRatio * 25); // 20–45% while installation is underway
  }

  return 0;
}

function commissionedCount(stations = []) {
  return stations.filter((s) => s.commissioningDate).length;
}

/** Project work done = average of all station work-done percentages */
function projectWorkDonePct(stations = []) {
  if (!stations.length) return 0;
  const sum = stations.reduce((total, station) => total + stationWorkDonePct(station), 0);
  return Math.round(sum / stations.length);
}

async function getStats(user) {
  const scope = projectScopeFilter(user);
  const [totalProjects, pendingReports, verifiedReports, pendingPayments, projects, paidAgg] = await Promise.all([
    Project.countDocuments(scope),
    Report.countDocuments({ status: REPORT_STATUS.PENDING }),
    Report.countDocuments({ status: REPORT_STATUS.VERIFIED }),
    Payment.countDocuments({ status: PAYMENT_STATUS.PENDING }),
    Project.find(scope, 'stations targetDate'),
    Payment.aggregate([{ $match: { status: PAYMENT_STATUS.PAID } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);

  const allStations = projects.flatMap((p) => p.stations || []);
  const now = new Date();

  const avgCompletion =
    allStations.length > 0
      ? Math.round(allStations.reduce((sum, s) => sum + stationWorkDonePct(s), 0) / allStations.length)
      : 0;
  const stationsBehind = allStations.filter((s) => stationWorkDonePct(s) < 50).length;
  const totalPaidAmount = paidAgg[0]?.total || 0;

  const stationsTracked = allStations.length;
  const pendingApprovals = allStations.filter((s) => s.claimStatus === CLAIM_STATUS.PENDING_APPROVAL).length;
  const delayFlags = projects.reduce((count, project) => {
    if (!project.targetDate || new Date(project.targetDate) >= now) return count;
    const unfinished = (project.stations || []).filter((s) => stationWorkDonePct(s) < 70).length;
    return count + unfinished;
  }, 0);
  const totalClaimed = allStations.reduce((sum, s) => sum + (Number(s.amountClaimed) || 0), 0);
  const bonusAwarded = allStations.reduce((sum, s) => sum + (s.bonusEligible ? Number(s.bonusAmount) || 0 : 0), 0);
  const overallWorkDone =
    projects.length > 0
      ? Math.round(projects.reduce((sum, p) => sum + projectWorkDonePct(p.stations || []), 0) / projects.length)
      : 0;

  return {
    totalProjects,
    pendingReports,
    verifiedReports,
    pendingPayments,
    avgCompletion,
    overallWorkDone,
    stationsBehind,
    totalPaidAmount,
    stationsTracked,
    pendingApprovals,
    delayFlags,
    totalClaimed,
    bonusAwarded,
  };
}

async function getProjectProgress() {
  const results = await Report.aggregate([
    {
      $group: {
        _id: '$project',
        avgProgress: { $avg: '$progressPercentage' },
        reportCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'projects',
        localField: '_id',
        foreignField: '_id',
        as: 'project',
      },
    },
    { $unwind: '$project' },
    {
      $project: {
        _id: 0,
        projectId: '$project._id',
        projectName: '$project.projectName',
        progressPercentage: { $round: ['$avgProgress', 0] },
        reportCount: 1,
      },
    },
    { $sort: { projectName: 1 } },
    { $limit: 20 },
  ]);

  return results;
}

async function getProjectsOverview(limit = 10, user) {
  const scope = projectScopeFilter(user);
  const projects = await Project.find(
    scope,
    'projectName panelSerialNo loaNo railwayZone installationStartDate targetDate stations'
  )
    .sort({ createdAt: -1 })
    .limit(Number(limit));

  const now = new Date();

  return projects.map((p) => {
    const stations = p.stations || [];
    const commissioned = commissionedCount(stations);
    const total = stations.length;
    const completion = projectWorkDonePct(stations);
    const targetDate = p.targetDate || null;

    let statusLabel = 'In Progress';
    if (total > 0 && completion >= 100) statusLabel = 'Completed';
    else if (total > 0 && commissioned >= total) statusLabel = 'Completed';
    else if (targetDate && new Date(targetDate) < now && completion < 100) statusLabel = 'Overdue';
    else if (completion === 0) statusLabel = 'Not Started';

    let daysToTarget = null;
    if (targetDate) {
      daysToTarget = Math.round((new Date(targetDate) - now) / 86400000);
    }

    return {
      projectId: p._id,
      projectName: p.projectName,
      panelSerialNo: p.panelSerialNo,
      loaNo: p.loaNo || '',
      railwayZone: p.railwayZone || '',
      installationStartDate: p.installationStartDate || null,
      stationCount: total,
      commissioned,
      completion,
      targetDate,
      daysToTarget,
      statusLabel,
      stations: stations.map((s) => {
        const workDone = stationWorkDonePct(s);
        return {
          id: s._id,
          name: s.name,
          type: s.type,
          claimStatus: s.claimStatus,
          commissioningDate: s.commissioningDate,
          completion: workDone,
          workDone,
        };
      }),
    };
  });
}

async function getDailyFeed(limit = 8, user) {
  const scope = projectScopeFilter(user);
  const projects = await Project.find({ ...scope, 'dailyReports.0': { $exists: true } }, 'projectName dailyReports')
    .populate('dailyReports.createdBy', 'name')
    .sort({ updatedAt: -1 })
    .limit(50);

  const entries = [];
  projects.forEach((p) => {
    p.dailyReports.forEach((r) => {
      entries.push({
        projectId: p._id,
        projectName: p.projectName,
        comment: r.comment,
        issue: r.issue,
        photo: r.photos?.[0] || null,
        photoCount: r.photos?.length || 0,
        submittedBy: r.createdBy?.name || 'Unknown',
        at: r.createdAt,
      });
    });
  });

  return entries.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, Number(limit));
}

async function getRecentReports(limit = 5) {
  return Report.find({})
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .populate('project', 'projectName panelSerialNo')
    .populate('submittedBy', 'name email');
}

async function getRecentActivity(limit = 10) {
  const take = Number(limit);

  const [reports, payments] = await Promise.all([
    Report.find({})
      .sort({ updatedAt: -1 })
      .limit(take)
      .populate('project', 'projectName')
      .populate('submittedBy', 'name'),
    Payment.find({})
      .sort({ updatedAt: -1 })
      .limit(take)
      .populate('project', 'projectName'),
  ]);

  const activity = [];

  reports.forEach((r) => {
    if (r.status === REPORT_STATUS.VERIFIED && r.verifiedAt) {
      activity.push({
        type: 'report_verified',
        message: `Report for "${r.project?.projectName || 'Unknown project'}" was verified`,
        at: r.verifiedAt,
      });
    } else {
      activity.push({
        type: 'report_submitted',
        message: `${r.submittedBy?.name || 'A user'} submitted a report for "${r.project?.projectName || 'Unknown project'}"`,
        at: r.createdAt,
      });
    }
  });

  payments.forEach((p) => {
    activity.push({
      type: 'payment_status_changed',
      message: `Payment for "${p.project?.projectName || 'Unknown project'}" is now "${p.status}"`,
      at: p.updatedAt,
    });
  });

  return activity.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, take);
}

module.exports = { getStats, getProjectProgress, getProjectsOverview, getDailyFeed, getRecentReports, getRecentActivity };

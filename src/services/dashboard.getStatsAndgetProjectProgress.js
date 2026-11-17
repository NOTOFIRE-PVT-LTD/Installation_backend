const Project = require('../models/Project.model');
const Report = require('../models/Report.model');
const Payment = require('../models/Payment.model');
const User = require('../models/User.model');
const Customer = require('../models/Customer.model');
const Attendance = require('../models/Attendance.model');
const { REPORT_STATUS, PAYMENT_STATUS, CLAIM_STATUS, ROLES, USER_STATUS, JOB_ROLES } = require('../config/constants');
const { kolkataToday } = require('../utils/kolkataDate');

function projectScopeFilter(user) {
  if (user?.role === ROLES.USER) {
    return { $or: [{ assignedInstallers: user._id }, { assignedInstaller: user._id }] };
  }
  return {};
}

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

function projectWorkDonePct(stations = []) {
  if (!stations.length) return 0;
  const sum = stations.reduce((total, station) => total + stationWorkDonePct(station), 0);
  return Math.round(sum / stations.length);
}

async function getStats(user) {
  const scope = projectScopeFilter(user);
  const today = kolkataToday();
  const [totalProjects, pendingReports, verifiedReports, pendingPayments, projects, paidAgg, fieldCustomers, fieldSalespeople, fieldPunchedIn, fieldPunchedOut] = await Promise.all([
    Project.countDocuments(scope),
    Report.countDocuments({ status: REPORT_STATUS.PENDING }),
    Report.countDocuments({ status: REPORT_STATUS.VERIFIED }),
    Payment.countDocuments({ status: PAYMENT_STATUS.PENDING }),
    Project.find(scope, 'stations targetDate'),
    Payment.aggregate([{ $match: { status: PAYMENT_STATUS.PAID } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Customer.countDocuments({ active: true }),
    User.countDocuments({ role: ROLES.USER, jobRole: JOB_ROLES.SALESPERSON, status: USER_STATUS.ACTIVE }),
    Attendance.countDocuments({ attendanceDate: today }),
    Attendance.countDocuments({ attendanceDate: today, status: Attendance.ATTENDANCE_STATUS.CLOSED }),
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
    fieldCustomers,
    fieldSalespeople,
    fieldPunchedIn,
    fieldPunchedOut,
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

function stationMaterialBucket(station) {
  if (!station) return 'pending';
  if (
    station.commissioningDate ||
    station.claimStatus === CLAIM_STATUS.APPROVED ||
    station.claimStatus === CLAIM_STATUS.PAID
  ) {
    return 'done';
  }
  if (
    station.claimStatus === CLAIM_STATUS.PENDING_APPROVAL ||
    (station.completionDate && !station.commissioningDate)
  ) {
    return 'callPutOn';
  }
  if (station.startDate || station.completionDate) return 'workInProgress';
  return 'pending';
}

function allocateByRatios(total, ratios) {
  const keys = Object.keys(ratios);
  const safeTotal = Math.max(0, Math.round(Number(total) || 0));
  if (safeTotal === 0 || keys.length === 0) {
    return Object.fromEntries(keys.map((k) => [k, 0]));
  }

  const weightSum = keys.reduce((sum, key) => sum + Math.max(0, Number(ratios[key]) || 0), 0);
  if (weightSum <= 0) {
    const empty = Object.fromEntries(keys.map((k) => [k, 0]));
    empty[keys[keys.length - 1]] = safeTotal;
    return empty;
  }

  const raw = keys.map((key) => {
    const exact = (safeTotal * Math.max(0, Number(ratios[key]) || 0)) / weightSum;
    return { key, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let remaining = safeTotal - raw.reduce((sum, row) => sum + row.floor, 0);
  raw
    .slice()
    .sort((a, b) => b.frac - a.frac)
    .forEach((row) => {
      if (remaining <= 0) return;
      row.floor += 1;
      remaining -= 1;
    });

  return Object.fromEntries(raw.map((row) => [row.key, row.floor]));
}

function projectMaterialRatios(stations = []) {
  if (!stations.length) {
    return { done: 0, workInProgress: 0, callPutOn: 0, pending: 1 };
  }
  const counts = { done: 0, workInProgress: 0, callPutOn: 0, pending: 0 };
  stations.forEach((station) => {
    counts[stationMaterialBucket(station)] += 1;
  });
  return counts;
}

function normalizeMaterialName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  projectScopeFilter,
  stationWorkDonePct,
  commissionedCount,
  projectWorkDonePct,
  getStats,
  getProjectProgress,
  stationMaterialBucket,
  allocateByRatios,
  projectMaterialRatios,
  normalizeMaterialName,
};

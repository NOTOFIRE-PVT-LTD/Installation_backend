const Project = require('../models/Project.model');
const Report = require('../models/Report.model');
const Payment = require('../models/Payment.model');
const { REPORT_STATUS, PAYMENT_STATUS, CLAIM_STATUS, ROLES } = require('../config/constants');

function projectScopeFilter(user) {
  if (user?.role === ROLES.USER) {
    return { $or: [{ assignedInstallers: user._id }, { assignedInstaller: user._id }] };
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

/** Largest-remainder allocation so bucket counts always sum to `total`. */
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

const MATERIAL_SLICE_META = [
  { category: 'Panel', status: 'done', label: 'Panel done', color: '#1e3a8a' },
  { category: 'Panel', status: 'workInProgress', label: 'Panel work in progress', color: '#93c5fd' },
  { category: 'Panel', status: 'callPutOn', label: 'Panel call put on', color: '#7c3aed' },
  { category: 'Panel', status: 'pending', label: 'Panel pending', color: '#c4b5fd' },
  { category: 'ASD', status: 'done', label: 'ASD done', color: '#166534' },
  { category: 'ASD', status: 'workInProgress', label: 'ASD work in progress', color: '#4ade80' },
  { category: 'ASD', status: 'pending', label: 'ASD pending', color: '#bbf7d0' },
  { category: 'LHS', status: 'done', label: 'LHS done', color: '#7f1d1d' },
  { category: 'LHS', status: 'workInProgress', label: 'LHS work in progress', color: '#ef4444' },
  { category: 'LHS', status: 'pending', label: 'LHS pending', color: '#f9a8d4' },
];

function buildProjectMaterialChart(project) {
  const stations = project.stations || [];
  const ratios = projectMaterialRatios(stations);
  const panelTotal = Math.max(0, Number(project.totalUnits?.panel) || 0);
  const asdTotal = Math.max(0, Number(project.totalUnits?.asd) || 0);
  const lhsTotal = Math.max(0, Number(project.totalUnits?.lhs) || 0);
  const stationTotal = stations.length;
  const stationsCompleted = commissionedCount(stations);
  const stationsNotCompleted = Math.max(0, stationTotal - stationsCompleted);

  const panelAlloc = allocateByRatios(panelTotal, {
    done: ratios.done,
    workInProgress: ratios.workInProgress,
    callPutOn: ratios.callPutOn,
    pending: ratios.pending,
  });
  const asdAlloc = allocateByRatios(asdTotal, {
    done: ratios.done,
    workInProgress: ratios.workInProgress,
    pending: ratios.pending + ratios.callPutOn,
  });
  const lhsAlloc = allocateByRatios(lhsTotal, {
    done: ratios.done,
    workInProgress: ratios.workInProgress,
    pending: ratios.pending + ratios.callPutOn,
  });

  const totals = {
    Panel: {
      done: panelAlloc.done || 0,
      workInProgress: panelAlloc.workInProgress || 0,
      callPutOn: panelAlloc.callPutOn || 0,
      pending: panelAlloc.pending || 0,
    },
    ASD: {
      done: asdAlloc.done || 0,
      workInProgress: asdAlloc.workInProgress || 0,
      callPutOn: 0,
      pending: asdAlloc.pending || 0,
    },
    LHS: {
      done: lhsAlloc.done || 0,
      workInProgress: lhsAlloc.workInProgress || 0,
      callPutOn: 0,
      pending: lhsAlloc.pending || 0,
    },
  };

  const materialSlices = MATERIAL_SLICE_META.map((meta) => ({
    name: meta.label,
    category: meta.category,
    status: meta.status,
    value: totals[meta.category][meta.status] || 0,
    color: meta.color,
  })).filter((slice) => slice.value > 0);

  const stationSlices = [
    {
      name: 'Stations completed',
      category: 'Stations',
      status: 'completed',
      value: stationsCompleted,
      color: '#0f766e',
    },
    {
      name: 'Stations not completed',
      category: 'Stations',
      status: 'notCompleted',
      value: stationsNotCompleted,
      color: '#f59e0b',
    },
  ].filter((slice) => slice.value > 0);

  const slices = [...materialSlices, ...stationSlices];
  const chartTotal = slices.reduce((sum, slice) => sum + slice.value, 0);
  const materialTotal = materialSlices.reduce((sum, slice) => sum + slice.value, 0);
  const slicesWithPct = slices.map((slice) => ({
    ...slice,
    percent: chartTotal > 0 ? Math.round((slice.value / chartTotal) * 1000) / 10 : 0,
  }));

  const statusOrder = ['done', 'workInProgress', 'callPutOn', 'pending'];
  const statusLabels = {
    done: 'done',
    workInProgress: 'work in progress',
    callPutOn: 'call put on',
    pending: 'pending',
  };

  const summaries = ['Panel', 'ASD', 'LHS'].map((category) => {
    const bucket = totals[category];
    const total = statusOrder.reduce((sum, key) => sum + (bucket[key] || 0), 0);
    return {
      category,
      total,
      parts: statusOrder
        .filter((key) => (category === 'Panel' ? true : key !== 'callPutOn'))
        .filter((key) => (bucket[key] || 0) > 0 || total === 0)
        .map((key) => ({
          status: statusLabels[key],
          count: bucket[key] || 0,
        })),
    };
  });

  summaries.push({
    category: 'Stations',
    total: stationTotal,
    parts: [
      { status: 'completed', count: stationsCompleted },
      { status: 'not completed', count: stationsNotCompleted },
    ],
  });

  return {
    panelTotal,
    asdTotal,
    lhsTotal,
    stationTotal,
    stationsCompleted,
    stationsNotCompleted,
    totalUnits: materialTotal,
    chartTotal,
    slices: slicesWithPct,
    summaries,
    totals,
  };
}

async function getProjectsOverview(limit = 10, user) {
  const scope = projectScopeFilter(user);
  const projects = await Project.find(
    scope,
    'projectName panelSerialNo loaNo railwayZone installationStartDate targetDate stations totalUnits'
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
    const material = buildProjectMaterialChart(p);

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
      material,
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

/**
 * Aggregated AFDAS overview across all projects (Panel / ASD / LHS).
 */
async function getMaterialStatusOverview(user) {
  const scope = projectScopeFilter(user);
  const projects = await Project.find(scope, 'projectName totalUnits stations');

  const totals = {
    Panel: { done: 0, workInProgress: 0, callPutOn: 0, pending: 0 },
    ASD: { done: 0, workInProgress: 0, callPutOn: 0, pending: 0 },
    LHS: { done: 0, workInProgress: 0, callPutOn: 0, pending: 0 },
  };

  projects.forEach((project) => {
    const material = buildProjectMaterialChart(project);
    ['Panel', 'ASD', 'LHS'].forEach((category) => {
      ['done', 'workInProgress', 'callPutOn', 'pending'].forEach((key) => {
        totals[category][key] += material.totals[category][key] || 0;
      });
    });
  });

  const slices = MATERIAL_SLICE_META.map((meta) => ({
    name: meta.label,
    category: meta.category,
    status: meta.status,
    value: totals[meta.category][meta.status] || 0,
    color: meta.color,
  })).filter((slice) => slice.value > 0);

  const totalUnits = slices.reduce((sum, slice) => sum + slice.value, 0);
  const slicesWithPct = slices.map((slice) => ({
    ...slice,
    percent: totalUnits > 0 ? Math.round((slice.value / totalUnits) * 1000) / 10 : 0,
  }));

  const statusOrder = ['done', 'workInProgress', 'callPutOn', 'pending'];
  const statusLabels = {
    done: 'done',
    workInProgress: 'work in progress',
    callPutOn: 'call put on',
    pending: 'pending',
  };

  const summaries = ['Panel', 'ASD', 'LHS'].map((category) => {
    const bucket = totals[category];
    const total = statusOrder.reduce((sum, key) => sum + (bucket[key] || 0), 0);
    return {
      category,
      total,
      parts: statusOrder
        .filter((key) => (category === 'Panel' ? true : key !== 'callPutOn'))
        .filter((key) => (bucket[key] || 0) > 0 || total === 0)
        .map((key) => ({
          status: statusLabels[key],
          count: bucket[key] || 0,
        })),
    };
  });

  return {
    title: 'AFDAS Work — Material Status Overview',
    subtitle: `Control Panel, ASD & LHS (Total: ${totalUnits} units)`,
    totalUnits,
    slices: slicesWithPct,
    summaries,
  };
}

module.exports = {
  getStats,
  getProjectProgress,
  getProjectsOverview,
  getDailyFeed,
  getRecentReports,
  getRecentActivity,
  getMaterialStatusOverview,
};

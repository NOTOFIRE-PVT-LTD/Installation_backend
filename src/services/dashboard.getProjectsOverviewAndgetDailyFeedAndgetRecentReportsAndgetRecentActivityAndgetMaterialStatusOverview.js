const Project = require('../models/Project.model');
const Report = require('../models/Report.model');
const Payment = require('../models/Payment.model');
const User = require('../models/User.model');
const Customer = require('../models/Customer.model');
const Attendance = require('../models/Attendance.model');
const { REPORT_STATUS, PAYMENT_STATUS, CLAIM_STATUS, ROLES, USER_STATUS, JOB_ROLES } = require('../config/constants');
const { kolkataToday } = require('../utils/kolkataDate');

const { commissionedCount, projectScopeFilter, projectWorkDonePct, stationWorkDonePct } = require('./dashboard.getStatsAndgetProjectProgress');
const { buildProjectMaterialChart } = require('./dashboard.sumMaterialQtyHelpers');
const { MATERIAL_SLICE_META } = require('./dashboard.materialConstants');

async function getProjectsOverview(limit = 10, user) {
  const scope = projectScopeFilter(user);
  const projects = await Project.find(
    scope,
    'projectName panelSerialNo loaNo railwayZone installationStartDate targetDate stations totalUnits loaItems'
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

async function getMaterialStatusOverview(user) {
  const scope = projectScopeFilter(user);
  const projects = await Project.find(scope, 'projectName totalUnits stations loaItems');

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
  getProjectsOverview,
  getDailyFeed,
  getRecentReports,
  getRecentActivity,
  getMaterialStatusOverview,
};

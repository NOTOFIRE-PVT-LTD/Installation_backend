const Project = require('../models/Project.model');
const Report = require('../models/Report.model');
const Payment = require('../models/Payment.model');
const User = require('../models/User.model');
const Customer = require('../models/Customer.model');
const Attendance = require('../models/Attendance.model');
const { REPORT_STATUS, PAYMENT_STATUS, CLAIM_STATUS, ROLES, USER_STATUS, JOB_ROLES } = require('../config/constants');
const { kolkataToday } = require('../utils/kolkataDate');

const { allocateByRatios, commissionedCount, normalizeMaterialName, projectMaterialRatios } = require('./dashboard.getStatsAndgetProjectProgress');
const { MATERIAL_DONE_ITEMS, MATERIAL_SLICE_META } = require('./dashboard.materialConstants');

function sumMaterialQty(rows = []) {
  const sums = { Panel: 0, ASD: 0, LHS: 0 };
  const found = { Panel: false, ASD: false, LHS: false };
  rows.forEach((row) => {
    const itemName = normalizeMaterialName(row.item);
    const qty = Math.max(0, Number(row.qty) || 0);
    Object.entries(MATERIAL_DONE_ITEMS).forEach(([category, target]) => {
      if (itemName === target) {
        sums[category] += qty;
        found[category] = true;
      }
    });
  });
  return { sums, found };
}

function stationMaterialDoneQty(stations = []) {
  return sumMaterialQty(stations.flatMap((station) => station.materials || [])).sums;
}

function projectLoaTotals(project) {
  const { sums, found } = sumMaterialQty(project.loaItems || []);
  const fallback = {
    Panel: Number(project.totalUnits?.panel) || 0,
    ASD: Number(project.totalUnits?.asd) || 0,
    LHS: Number(project.totalUnits?.lhs) || 0,
  };
  return Object.fromEntries(
    Object.keys(sums).map((category) => [
      category,
      Math.max(0, Math.round(found[category] ? sums[category] : fallback[category])),
    ])
  );
}

function buildProjectMaterialChart(project) {
  const stations = project.stations || [];
  const ratios = projectMaterialRatios(stations);
  const loaTotals = projectLoaTotals(project);
  const panelTotal = loaTotals.Panel;
  const asdTotal = loaTotals.ASD;
  const lhsTotal = loaTotals.LHS;
  const stationTotal = stations.length;
  const stationsCompleted = commissionedCount(stations);
  const stationsNotCompleted = Math.max(0, stationTotal - stationsCompleted);

  const materialDone = stationMaterialDoneQty(stations);
  const panelDone = Math.min(panelTotal, Math.round(materialDone.Panel));
  const asdDone = Math.min(asdTotal, Math.round(materialDone.ASD));
  const lhsDone = Math.min(lhsTotal, Math.round(materialDone.LHS));

  const panelAlloc = allocateByRatios(panelTotal - panelDone, {
    workInProgress: ratios.workInProgress,
    callPutOn: ratios.callPutOn,
    pending: ratios.pending,
  });
  const asdAlloc = allocateByRatios(asdTotal - asdDone, {
    workInProgress: ratios.workInProgress,
    pending: ratios.pending + ratios.callPutOn,
  });
  const lhsAlloc = allocateByRatios(lhsTotal - lhsDone, {
    workInProgress: ratios.workInProgress,
    pending: ratios.pending + ratios.callPutOn,
  });
  panelAlloc.done = panelDone;
  asdAlloc.done = asdDone;
  lhsAlloc.done = lhsDone;

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
      color: '#8C591D',
    },
    {
      name: 'Stations not completed',
      category: 'Stations',
      status: 'notCompleted',
      value: stationsNotCompleted,
      color: '#FBE7A1',
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

module.exports = {
  sumMaterialQty,
  stationMaterialDoneQty,
  projectLoaTotals,
  buildProjectMaterialChart,
};

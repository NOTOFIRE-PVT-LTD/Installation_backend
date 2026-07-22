const projectRepository = require('../repositories/project.repository');
const userRepository = require('../repositories/user.repository');
const numberDirectoryRepository = require('../repositories/numberDirectory.repository');
const tenderRepository = require('../repositories/tender.repository');
const { ROLES } = require('../config/constants');

function projectScopeFilter(user) {
  if (user?.role === ROLES.USER) {
    return { assignedInstaller: user._id };
  }
  return {};
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function canAccess(user, key, { allowInstaller = false } = {}) {
  if (!user) return false;

  if (user.role !== ROLES.ADMIN) {
    if (!allowInstaller) return false;
    if (user.permissions && user.permissions[key] === false) return false;
    return true;
  }

  return Boolean(user.permissions?.[key]);
}

function mapProject(project) {
  return {
    type: 'project',
    id: String(project._id),
    title: project.projectName,
    subtitle: [project.panelSerialNo, project.railwayZone, project.installerName].filter(Boolean).join(' · '),
    path: `/projects/${project._id}`,
  };
}

function mapStation(project, station) {
  return {
    type: 'station',
    id: String(station._id),
    projectId: String(project._id),
    title: station.name,
    subtitle: [project.projectName, station.type, station.installer?.name].filter(Boolean).join(' · '),
    path: `/projects/${project._id}/stations/${station._id}`,
  };
}

function mapUser(user) {
  return {
    type: 'user',
    id: String(user._id),
    title: user.name,
    subtitle: [user.email, user.role, user.mobileNumber].filter(Boolean).join(' · '),
    path: `/users?search=${encodeURIComponent(user.name)}`,
  };
}

function mapNumber(entry) {
  return {
    type: 'number',
    id: String(entry._id),
    title: entry.name,
    subtitle: [entry.number, entry.region, entry.category].filter(Boolean).join(' · '),
    path: `/numbers?search=${encodeURIComponent(entry.name || entry.number)}`,
  };
}

function mapTender(tender) {
  const divisionName = tender.division?.name;
  const zone = tender.division?.zone;
  const projectName = tender.project?.projectName;
  const projectId = tender.project?._id || tender.project;
  return {
    type: 'tender',
    id: String(tender._id),
    title: tender.tenderName,
    subtitle: [divisionName, zone, projectName].filter(Boolean).join(' · '),
    path: projectId ? `/projects/${projectId}` : '/projects',
  };
}

async function search(query, user) {
  const q = String(query?.q || query?.search || '').trim();
  const limit = Math.min(Math.max(Number(query?.limit) || 5, 1), 10);

  if (q.length < 2) {
    return { projects: [], stations: [], users: [], numbers: [], tenders: [] };
  }

  const regex = new RegExp(escapeRegex(q), 'i');
  const result = { projects: [], stations: [], users: [], numbers: [], tenders: [] };

  const tasks = [];

  if (canAccess(user, 'projects', { allowInstaller: true })) {
    const scope = projectScopeFilter(user);
    tasks.push(
      projectRepository
        .paginate({
          filter: {
            ...scope,
            $or: [
              { projectName: regex },
              { installerName: regex },
              { contractor: regex },
              { panelSerialNo: regex },
              { railwayZone: regex },
            ],
          },
          sort: { projectName: 1 },
          skip: 0,
          limit,
        })
        .then(({ items }) => {
          result.projects = items.map(mapProject);
        })
    );

    tasks.push(
      projectRepository
        .find(
          {
            ...scope,
            $or: [
              { 'stations.name': regex },
              { 'stations.type': regex },
              { 'stations.installer.name': regex },
            ],
          },
          { select: 'projectName panelSerialNo stations', sort: { projectName: 1 } }
        )
        .then((projects) => {
          const stations = [];
          for (const project of projects) {
            for (const station of project.stations || []) {
              if (
                regex.test(station.name || '') ||
                regex.test(station.type || '') ||
                regex.test(station.installer?.name || '')
              ) {
                stations.push(mapStation(project, station));
                if (stations.length >= limit) break;
              }
            }
            if (stations.length >= limit) break;
          }
          result.stations = stations;
        })
    );
  }

  if (canAccess(user, 'users')) {
    tasks.push(
      userRepository
        .paginate({
          filter: {
            $or: [{ name: regex }, { email: regex }, { mobileNumber: regex }],
          },
          sort: { name: 1 },
          skip: 0,
          limit,
        })
        .then(({ items }) => {
          result.users = items.map(mapUser);
        })
    );
  }

  if (canAccess(user, 'numbers')) {
    tasks.push(
      numberDirectoryRepository
        .paginate({
          filter: {
            $or: [{ name: regex }, { number: regex }, { region: regex }],
          },
          sort: { name: 1 },
          skip: 0,
          limit,
        })
        .then(({ items }) => {
          result.numbers = items.map(mapNumber);
        })
    );
  }

  if (canAccess(user, 'cadDrawing')) {
    tasks.push(
      tenderRepository
        .paginate({
          filter: { tenderName: regex },
          sort: { tenderName: 1 },
          skip: 0,
          limit,
          populate: [
            { path: 'division', select: 'name zone' },
            { path: 'project', select: 'projectName' },
          ],
        })
        .then(({ items }) => {
          result.tenders = items.map(mapTender);
        })
    );
  }

  await Promise.all(tasks);
  return result;
}

module.exports = { search };

/** Permission flags → short labels for the Centralisation Users directory. */
const WORKSPACE_APP_FLAGS = [
  ['leadTrack', 'LeadTrack'],
  ['importControl', 'Import'],
  ['shipping', 'Shipping'],
  ['dashboard', 'Dashboard'],
  ['projects', 'Projects'],
  ['attendance', 'Attendance'],
  ['salespersonTracking', 'Attendance'],
  ['complaints', 'Complaints'],
  ['tenders', 'Tender'],
  ['payflow', 'Payflow'],
  ['payflowUser', 'Payment Requests'],
  ['salesTravelRequests', 'Sales Travel'],
  ['accounts', 'Accounts'],
  ['billing', 'Billing'],
  ['quotations', 'Quotations'],
  ['users', 'Users'],
];

function workspaceAppsFromFlags(flags = {}) {
  const seen = new Set();
  const labels = [];
  for (const [key, label] of WORKSPACE_APP_FLAGS) {
    if (!flags[key] || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

function isPlaceholderDirectoryName(name) {
  return !name || /^super\s*admin$/i.test(String(name).trim());
}

function formatPnlRole(role) {
  if (!role) return null;
  if (role === 'SUPER_ADMIN') return 'P&L Admin';
  return String(role).replace(/_/g, ' ');
}

module.exports = {
  workspaceAppsFromFlags,
  isPlaceholderDirectoryName,
  formatPnlRole,
};

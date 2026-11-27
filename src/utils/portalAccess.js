/**
 * Portal app grants.
 * Env: CENTRAL_BOTH_EMAILS | PRIMARY_SUPER_ADMIN_EMAIL |
 *      CENTRAL_PNL_EMAILS | CENTRAL_WORKSPACE_EMAILS | CENTRAL_LEADTRACK_EMAILS |
 *      CENTRAL_PNL_DEFAULT
 *
 * User.portalSource === 'pnl' → P&L-only
 * User.portalSource === 'leadtrack' → LeadTrack-only
 * Workspace Mongo users → workspace (+ optional P&L / leadtrack lists)
 */

function parseEmailList(raw) {
  return new Set(
    String(raw || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function accessCount(a) {
  return (
    Number(Boolean(a?.pnl)) +
    Number(Boolean(a?.workspace)) +
    Number(Boolean(a?.leadtrack))
  );
}

function bothApps(email) {
  const e = String(email || '').toLowerCase().trim();
  const both = parseEmailList(process.env.CENTRAL_BOTH_EMAILS);
  const primary = String(process.env.PRIMARY_SUPER_ADMIN_EMAIL || '')
    .toLowerCase()
    .trim();
  return Boolean(e && (both.has(e) || (primary && e === primary)));
}

function resolvePortalAccess(email, opts = {}) {
  const e = String(email || '').toLowerCase().trim();

  if (bothApps(e)) {
    return { pnl: true, workspace: true, leadtrack: true };
  }

  if (opts.portalSource === 'leadtrack') {
    return { pnl: false, workspace: false, leadtrack: true };
  }
  if (opts.portalSource === 'pnl') {
    return { pnl: true, workspace: false, leadtrack: false };
  }

  const pnlList = parseEmailList(process.env.CENTRAL_PNL_EMAILS);
  const wsList = parseEmailList(process.env.CENTRAL_WORKSPACE_EMAILS);
  const ltList = parseEmailList(process.env.CENTRAL_LEADTRACK_EMAILS);
  const listedPnl = Boolean(e && pnlList.has(e));
  const listedWs = Boolean(e && wsList.has(e));
  const listedLt = Boolean(e && ltList.has(e));
  if (listedPnl || listedWs || listedLt) {
    return { pnl: listedPnl, workspace: listedWs, leadtrack: listedLt };
  }

  const defaultPnl = process.env.CENTRAL_PNL_DEFAULT === 'true';
  return { pnl: defaultPnl, workspace: true, leadtrack: false };
}

/** Dual Centralisation (P&L + Workspace) may "log in as" another user. */
function canImpersonateUsers(email, opts = {}) {
  const a = resolvePortalAccess(email, opts);
  return Boolean(a.pnl && a.workspace);
}

module.exports = {
  resolvePortalAccess,
  accessCount,
  parseEmailList,
  canImpersonateUsers,
  bothApps,
};

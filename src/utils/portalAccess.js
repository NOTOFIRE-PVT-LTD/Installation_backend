/**
 * Portal app grants — mirrors Centralisation resolveCentralAccess.
 * Env: CENTRAL_BOTH_EMAILS | PRIMARY_SUPER_ADMIN_EMAIL |
 *      CENTRAL_PNL_EMAILS | CENTRAL_WORKSPACE_EMAILS | CENTRAL_PNL_DEFAULT
 */

function parseEmailList(raw) {
  return new Set(
    String(raw || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function resolvePortalAccess(email) {
  const e = String(email || '').toLowerCase().trim();
  const both = parseEmailList(process.env.CENTRAL_BOTH_EMAILS);
  const primary = String(process.env.PRIMARY_SUPER_ADMIN_EMAIL || '')
    .toLowerCase()
    .trim();
  const pnlList = parseEmailList(process.env.CENTRAL_PNL_EMAILS);
  const wsList = parseEmailList(process.env.CENTRAL_WORKSPACE_EMAILS);

  if (e && (both.has(e) || (primary && e === primary))) {
    return { pnl: true, workspace: true };
  }

  const listedPnl = Boolean(e && pnlList.has(e));
  const listedWs = Boolean(e && wsList.has(e));
  if (listedPnl || listedWs) {
    return { pnl: listedPnl, workspace: listedWs };
  }

  // Mongo/Workspace users: workspace by default; P&L via lists or CENTRAL_PNL_DEFAULT.
  const defaultPnl = process.env.CENTRAL_PNL_DEFAULT !== 'false';
  return { pnl: defaultPnl, workspace: true };
}

function accessCount(a) {
  return Number(Boolean(a?.pnl)) + Number(Boolean(a?.workspace));
}

module.exports = { resolvePortalAccess, accessCount, parseEmailList };

/**
 * Portal app grants.
 * Env: CENTRAL_BOTH_EMAILS | PRIMARY_SUPER_ADMIN_EMAIL |
 *      CENTRAL_PNL_EMAILS | CENTRAL_WORKSPACE_EMAILS | CENTRAL_PNL_DEFAULT
 *
 * User.portalSource === 'pnl' → P&L-only (auto-provisioned from P&L OTP/password).
 * Workspace Mongo users → workspace; P&L only if listed or CENTRAL_PNL_DEFAULT.
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
  return Number(Boolean(a?.pnl)) + Number(Boolean(a?.workspace));
}

function resolvePortalAccess(email, opts = {}) {
  const e = String(email || '').toLowerCase().trim();
  const both = parseEmailList(process.env.CENTRAL_BOTH_EMAILS);
  const primary = String(process.env.PRIMARY_SUPER_ADMIN_EMAIL || '')
    .toLowerCase()
    .trim();
  const pnlList = parseEmailList(process.env.CENTRAL_PNL_EMAILS);
  const wsList = parseEmailList(process.env.CENTRAL_WORKSPACE_EMAILS);

  // Gaurav / Mansi / SUPER_ADMIN → both apps chooser.
  if (opts.adminType === 'SUPER_ADMIN' || (e && (both.has(e) || (primary && e === primary)))) {
    return { pnl: true, workspace: true };
  }

  // P&L-only shadows — before email lists / CENTRAL_PNL_DEFAULT.
  if (opts.portalSource === 'pnl') {
    return { pnl: true, workspace: false };
  }

  const listedPnl = Boolean(e && pnlList.has(e));
  const listedWs = Boolean(e && wsList.has(e));
  if (listedPnl || listedWs) {
    return { pnl: listedPnl, workspace: listedWs };
  }

  // Real Workspace users: workspace always; P&L only when default/list says so.
  const defaultPnl = process.env.CENTRAL_PNL_DEFAULT === 'true';
  return { pnl: defaultPnl, workspace: true };
}

module.exports = { resolvePortalAccess, accessCount, parseEmailList };

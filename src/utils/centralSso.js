const crypto = require('crypto');

/** jti → { claims, until } — one-time, but allow brief replay (React Strict Mode double-mount). */
const used = new Map();

function secret() {
  const s = process.env.SSO_SECRET || process.env.JWT_ACCESS_SECRET;
  if (!s) throw new Error('SSO_SECRET is required for Centralisation SSO');
  return s;
}

function sign(payloadB64) {
  return crypto.createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

function pruneUsed() {
  const now = Date.now();
  for (const [k, entry] of used) {
    if (entry.until < now) used.delete(k);
  }
}

/**
 * Verify + consume a one-time code minted by the P&L / Centralisation portal.
 * Must use the same SSO_SECRET as Price-master-sheet.
 */
function consumeCentralSsoCode(code, expectApp = 'workspace') {
  pruneUsed();
  if (!code || typeof code !== 'string') return null;
  const parts = code.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expected = sign(payloadB64);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (claims.v !== 1 || !claims.jti || !claims.email || !claims.app) return null;
  if (claims.exp < Math.floor(Date.now() / 1000)) return null;
  if (expectApp && claims.app !== expectApp) return null;

  const prior = used.get(claims.jti);
  if (prior) {
    // shortcut: same tab Strict Mode / double POST within 45s returns same claims
    return prior.until > Date.now() ? prior.claims : null;
  }

  used.set(claims.jti, { claims, until: Date.now() + 45_000 });
  return claims;
}

module.exports = { consumeCentralSsoCode };

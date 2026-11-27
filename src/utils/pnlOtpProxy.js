/** Server-side calls (OTP) — prefer loopback so nginx path layout cannot break proxy. */
function pnlBase() {
  return String(
    process.env.PNL_INTERNAL_URL || process.env.PNL_PUBLIC_URL || 'http://localhost:3000',
  ).replace(/\/$/, '');
}

async function requestPnlOtp(phone) {
  const res = await fetch(`${pnlBase()}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body.ok !== false, status: res.status, body };
}

async function verifyPnlOtp(phone, code) {
  const res = await fetch(`${pnlBase()}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body.ok === true, status: res.status, body };
}

async function findPnlUserByPhone(phone) {
  const { Pool } = require('pg');
  const raw = process.env.PNL_DATABASE_URL || process.env.DATABASE_URL_PNL;
  if (!raw) return null;
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  const clean = raw.replace(/[?&]sslmode=[^&]*/gi, '').replace(/[?&]$/, '');
  const sep = clean.includes('?') ? '&' : '?';
  const pool = new Pool({
    connectionString: `${clean}${sep}sslmode=no-verify`,
    ssl: { rejectUnauthorized: false },
  });
  try {
    const { rows } = await pool.query(
      `SELECT email, name, phone, "isActive"
       FROM "User"
       WHERE regexp_replace(coalesce(phone, ''), '\\D', '', 'g') LIKE '%' || $1
       LIMIT 1`,
      [digits],
    );
    const row = rows[0];
    if (!row || row.isActive === false) return null;
    return { email: row.email, name: row.name || null, phone: row.phone || phone };
  } catch (err) {
    console.warn('[findPnlUserByPhone]', err.message);
    return null;
  } finally {
    await pool.end().catch(() => {});
  }
}

module.exports = { requestPnlOtp, verifyPnlOtp, findPnlUserByPhone };

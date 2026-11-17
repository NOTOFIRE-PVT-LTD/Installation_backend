const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

let pool;

function pnlDbUrl() {
  return process.env.PNL_DATABASE_URL || process.env.DATABASE_URL_PNL || '';
}

function getPool() {
  const url = pnlDbUrl();
  if (!url) return null;
  if (!pool) {
    // RDS often presents a chain that Node rejects; never verify CA for this fallback.
    const clean = url
      .replace(/[?&]sslmode=[^&]*/gi, '')
      .replace(/[?&]$/, '');
    const sep = clean.includes('?') ? '&' : '?';
    pool = new Pool({
      connectionString: `${clean}${sep}sslmode=no-verify`,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

/** Verify email/password against P&L Postgres. Returns { email, name } or null. */
async function verifyPnlPassword(email, password) {
  const db = getPool();
  if (!db || !email || !password) return null;
  const normalized = String(email).toLowerCase().trim();
  try {
    const { rows } = await db.query(
      `SELECT email, name, "passwordHash", "isActive"
       FROM "User"
       WHERE lower(email) = $1
       LIMIT 1`,
      [normalized],
    );
    const row = rows[0];
    if (!row || row.isActive === false || !row.passwordHash) return null;
    const ok = await bcrypt.compare(password, row.passwordHash);
    if (!ok) return null;
    return { email: row.email, name: row.name || null };
  } catch (err) {
    console.warn('[pnlPasswordFallback]', err.message);
    return null;
  }
}

module.exports = { verifyPnlPassword };

const { Pool } = require('pg');

let pool;

function pnlDbUrl() {
  return process.env.PNL_DATABASE_URL || process.env.DATABASE_URL_PNL || '';
}

function getPool() {
  const url = pnlDbUrl();
  if (!url) return null;
  if (!pool) {
    const clean = url.replace(/[?&]sslmode=[^&]*/gi, '').replace(/[?&]$/, '');
    const sep = clean.includes('?') ? '&' : '?';
    pool = new Pool({
      connectionString: `${clean}${sep}sslmode=no-verify`,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

/** Read-only P&L users for the Centralisation directory. */
async function listPnlDirectoryUsers() {
  const db = getPool();
  if (!db) return [];
  try {
    const { rows } = await db.query(
      `SELECT id, email, name, phone, "globalRole", "isActive"
       FROM "User"
       ORDER BY name ASC NULLS LAST, email ASC`
    );
    return rows.map((row) => ({
      id: String(row.id),
      email: String(row.email || '').toLowerCase().trim(),
      name: row.name || null,
      phone: row.phone || null,
      role: row.globalRole || null,
      active: row.isActive !== false,
    }));
  } catch (err) {
    console.warn('[pnlDirectory]', err.message);
    return [];
  }
}

module.exports = { listPnlDirectoryUsers };

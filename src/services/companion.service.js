const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const ApiError = require('../utils/ApiError');

const APPS = {
  shipping: {
    url: process.env.SHIPPING_SUPABASE_URL,
    anon: process.env.SHIPPING_SUPABASE_ANON_KEY,
    service: process.env.SHIPPING_SUPABASE_SERVICE_ROLE_KEY,
    activeField: 'active',
    profile(user, name) {
      return {
        id: user.id,
        email: user.email,
        full_name: name || user.email,
        role: 'admin',
        active: true,
      };
    },
  },
  import: {
    url: process.env.IMPORT_SUPABASE_URL,
    anon: process.env.IMPORT_SUPABASE_ANON_KEY,
    service: process.env.IMPORT_SUPABASE_SERVICE_ROLE_KEY,
    activeField: 'is_active',
    profile(user, name) {
      return {
        id: user.id,
        email: user.email,
        full_name: name || user.email,
        role: 'admin',
        is_active: true,
      };
    },
  },
};

async function findAuthUser(admin, email) {
  if (typeof admin.auth.admin.getUserByEmail === 'function') {
    const found = await admin.auth.admin.getUserByEmail(email);
    if (found.data?.user) return found.data.user;
  }
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw new ApiError(500, listed.error.message);
  return (
    (listed.data?.users || []).find(
      (user) => String(user.email || '').toLowerCase() === email
    ) || null
  );
}

async function findExistingAdmin(admin, activeField) {
  const { data } = await admin
    .from('profiles')
    .select('email')
    .eq('role', 'admin')
    .eq(activeField, true)
    .limit(1);
  const email = String(data?.[0]?.email || '').toLowerCase();
  if (!email) return null;
  return findAuthUser(admin, email);
}

async function findOrCreateAuthUser(admin, email, name, activeField, asAdmin) {
  const existing = await findAuthUser(admin, email);
  if (existing) return existing;

  if (!asAdmin) {
    throw new ApiError(403, 'No account for this app');
  }

  const created = await admin.auth.admin.createUser({
    email,
    password: crypto.randomBytes(24).toString('hex'),
    email_confirm: true,
    user_metadata: { full_name: name || email, role: 'admin', active: 'true' },
  });
  if (!created.error && created.data?.user) return created.data.user;

  const createdAnyway = await findAuthUser(admin, email);
  if (createdAnyway) return createdAnyway;

  const fallback = await findExistingAdmin(admin, activeField);
  if (fallback) return fallback;

  throw new ApiError(500, created.error?.message || 'Could not open a sign-in session');
}

async function openSession(appKey, { email, name, asAdmin = false }) {
  const cfg = APPS[appKey];
  if (!cfg) throw new ApiError(400, 'Unknown companion app');
  if (!cfg.url || !cfg.anon || !cfg.service) {
    throw new ApiError(503, `${appKey} is not configured on the server`);
  }

  const admin = createClient(cfg.url, cfg.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const user = await findOrCreateAuthUser(admin, email, name, cfg.activeField, asAdmin);
  if (asAdmin && String(user.email || '').toLowerCase() === email) {
    const profile = await admin.from('profiles').upsert(cfg.profile(user, name));
    if (profile.error) throw new ApiError(500, profile.error.message);
  }

  // Shipping/import only accept email+password. A magic-link token in the iframe
  // URL is what produced "Email link is invalid or has expired".
  const password = `Vc#${crypto.randomBytes(18).toString('base64url')}`;
  const updated = await admin.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
  });
  if (updated.error) throw new ApiError(500, updated.error.message);

  return { email: user.email, password };
}

module.exports = { openSession };

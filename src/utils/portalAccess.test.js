/**
 * Portal access matrix for migrated Workspace (Mongo) + P&L (Postgres) users.
 * Mirrors EC2: CENTRAL_PNL_DEFAULT=false, dual/SUPER_ADMIN → both, shadows → P&L only.
 */
const assert = require('node:assert/strict');
const { resolvePortalAccess, accessCount, parseEmailList } = require('./portalAccess');

function withEnv(vars, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const PROD_ENV = {
  CENTRAL_BOTH_EMAILS:
    'mansi@gmail.com,gauravjain@gmail.com,gauravjain@atlantatelecables.com,dual@centralisatian.local',
  PRIMARY_SUPER_ADMIN_EMAIL: 'gauravjain@gmail.com',
  CENTRAL_WORKSPACE_EMAILS: 'wsonly@centralisatian.local',
  CENTRAL_PNL_EMAILS: 'pnlonly@centralisatian.local',
  CENTRAL_PNL_DEFAULT: 'false',
};

withEnv(PROD_ENV, () => {
  // --- Dual / both-apps ---
  assert.deepEqual(
    resolvePortalAccess('dual@centralisatian.local', { adminType: 'SUPER_ADMIN' }),
    { pnl: true, workspace: true },
  );
  assert.equal(
    accessCount(resolvePortalAccess('dual@centralisatian.local', { adminType: 'SUPER_ADMIN' })),
    2,
  );
  assert.deepEqual(resolvePortalAccess('mansi@gmail.com', {}), { pnl: true, workspace: true });
  assert.deepEqual(resolvePortalAccess('gauravjain@gmail.com', {}), { pnl: true, workspace: true });
  assert.deepEqual(resolvePortalAccess('gauravjain@atlantatelecables.com', {}), {
    pnl: true,
    workspace: true,
  });

  // Email on BOTH list wins even without SUPER_ADMIN flag
  assert.deepEqual(resolvePortalAccess('dual@centralisatian.local', {}), {
    pnl: true,
    workspace: true,
  });

  // --- Workspace-only (migrated Mongo staff) ---
  assert.deepEqual(resolvePortalAccess('wsonly@centralisatian.local', {}), {
    pnl: false,
    workspace: true,
  });
  assert.deepEqual(resolvePortalAccess('atulsrivastava917@gmail.com', {}), {
    pnl: false,
    workspace: true,
  });
  assert.deepEqual(resolvePortalAccess('notofireprojects@gmail.com', {}), {
    pnl: false,
    workspace: true,
  });

  // --- P&L-only (Postgres user / Mongo portalSource shadow) ---
  assert.deepEqual(
    resolvePortalAccess('pnlonly@centralisatian.local', { portalSource: 'pnl' }),
    { pnl: true, workspace: false },
  );
  assert.deepEqual(resolvePortalAccess('pnlonly@centralisatian.local', {}), {
    pnl: true,
    workspace: false,
  });
  // portalSource=pnl beats being a "normal" workspace email shape
  assert.deepEqual(
    resolvePortalAccess('plant.manager@cat6.local', { portalSource: 'pnl' }),
    { pnl: true, workspace: false },
  );

  // --- SUPER_ADMIN always both (Workspace Mongo adminType) ---
  assert.deepEqual(
    resolvePortalAccess('someone@example.com', { adminType: 'SUPER_ADMIN' }),
    { pnl: true, workspace: true },
  );

  // --- portalSource=pnl must NOT unlock Workspace even if listed in BOTH by mistake order ---
  // SUPER_ADMIN still wins (platform owner) before portalSource check
  assert.deepEqual(
    resolvePortalAccess('shadow@example.com', {
      adminType: 'SUPER_ADMIN',
      portalSource: 'pnl',
    }),
    { pnl: true, workspace: true },
  );

  // Case / whitespace
  assert.deepEqual(resolvePortalAccess('  Mansi@Gmail.COM ', {}), {
    pnl: true,
    workspace: true,
  });

  assert.deepEqual(parseEmailList('a@x.com, b@y.com'), new Set(['a@x.com', 'b@y.com']));
});

// CENTRAL_PNL_DEFAULT=true must not be assumed in prod — document old bug
withEnv({ ...PROD_ENV, CENTRAL_PNL_DEFAULT: 'true', CENTRAL_PNL_EMAILS: '', CENTRAL_WORKSPACE_EMAILS: '' }, () => {
  assert.deepEqual(resolvePortalAccess('atul@example.com', {}), {
    pnl: true,
    workspace: true,
  });
});

withEnv({ ...PROD_ENV, CENTRAL_PNL_DEFAULT: 'false', CENTRAL_PNL_EMAILS: '', CENTRAL_WORKSPACE_EMAILS: '' }, () => {
  assert.deepEqual(resolvePortalAccess('atul@example.com', {}), {
    pnl: false,
    workspace: true,
  });
});

console.log('portalAccess.test.js OK');

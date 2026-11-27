/**
 * Portal access matrix for Workspace + P&L + LeadTrack.
 */
const assert = require('node:assert/strict');
const {
  resolvePortalAccess,
  accessCount,
  parseEmailList,
  canImpersonateUsers,
} = require('./portalAccess');

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
  assert.deepEqual(resolvePortalAccess('dual@centralisatian.local', { adminType: 'SUPER_ADMIN' }), {
    pnl: true,
    workspace: true,
    leadtrack: true,
  });
  assert.equal(accessCount(resolvePortalAccess('dual@centralisatian.local', {})), 3);
  assert.deepEqual(resolvePortalAccess('mansi@gmail.com', {}), {
    pnl: true,
    workspace: true,
    leadtrack: true,
  });
  assert.deepEqual(resolvePortalAccess('gauravjain@gmail.com', {}), {
    pnl: true,
    workspace: true,
    leadtrack: true,
  });
  assert.deepEqual(resolvePortalAccess('gauravjain@atlantatelecables.com', {}), {
    pnl: true,
    workspace: true,
    leadtrack: true,
  });
  assert.deepEqual(resolvePortalAccess('dual@centralisatian.local', {}), {
    pnl: true,
    workspace: true,
    leadtrack: true,
  });

  assert.deepEqual(resolvePortalAccess('wsonly@centralisatian.local', {}), {
    pnl: false,
    workspace: true,
    leadtrack: false,
  });
  assert.deepEqual(resolvePortalAccess('atulsrivastava917@gmail.com', {}), {
    pnl: false,
    workspace: true,
    leadtrack: false,
  });

  assert.deepEqual(
    resolvePortalAccess('pnlonly@centralisatian.local', { portalSource: 'pnl' }),
    { pnl: true, workspace: false, leadtrack: false },
  );
  assert.deepEqual(resolvePortalAccess('pnlonly@centralisatian.local', {}), {
    pnl: true,
    workspace: false,
    leadtrack: false,
  });
  assert.deepEqual(
    resolvePortalAccess('plant.manager@cat6.local', { portalSource: 'pnl' }),
    { pnl: true, workspace: false, leadtrack: false },
  );

  assert.deepEqual(
    resolvePortalAccess('monika@workspace.local', { adminType: 'SUPER_ADMIN' }),
    { pnl: false, workspace: true, leadtrack: false },
  );
  assert.deepEqual(
    resolvePortalAccess('shadow@example.com', {
      adminType: 'SUPER_ADMIN',
      portalSource: 'pnl',
    }),
    { pnl: true, workspace: false, leadtrack: false },
  );

  assert.deepEqual(
    resolvePortalAccess('admin@leadtrack.local', { portalSource: 'leadtrack' }),
    { pnl: false, workspace: false, leadtrack: true },
  );

  assert.deepEqual(resolvePortalAccess('  Mansi@Gmail.COM ', {}), {
    pnl: true,
    workspace: true,
    leadtrack: true,
  });
  assert.deepEqual(parseEmailList('a@x.com, b@y.com'), new Set(['a@x.com', 'b@y.com']));

  assert.equal(canImpersonateUsers('mansi@gmail.com'), true);
  assert.equal(canImpersonateUsers('wsonly@centralisatian.local'), false);
  assert.equal(
    canImpersonateUsers('admin@leadtrack.local', { portalSource: 'leadtrack' }),
    false,
  );
});

withEnv(
  { ...PROD_ENV, CENTRAL_PNL_DEFAULT: 'true', CENTRAL_PNL_EMAILS: '', CENTRAL_WORKSPACE_EMAILS: '' },
  () => {
    assert.deepEqual(resolvePortalAccess('atul@example.com', {}), {
      pnl: true,
      workspace: true,
      leadtrack: false,
    });
  },
);

withEnv(
  { ...PROD_ENV, CENTRAL_PNL_DEFAULT: 'false', CENTRAL_PNL_EMAILS: '', CENTRAL_WORKSPACE_EMAILS: '' },
  () => {
    assert.deepEqual(resolvePortalAccess('atul@example.com', {}), {
      pnl: false,
      workspace: true,
      leadtrack: false,
    });
  },
);

console.log('portalAccess.test.js OK');

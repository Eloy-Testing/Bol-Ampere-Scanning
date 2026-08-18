import assert from 'node:assert/strict';
import test from 'node:test';
import integrations from '../../api/integrations.mjs';
import retailer from '../../api/retailer.mjs';
import reconciliation from '../../api/reconciliation.mjs';
import scan from '../../api/scan.mjs';
import session from '../../api/session.mjs';
import state from '../../api/state.mjs';

test('Vercel entrypoints expose Web Standard fetch handlers', () => {
  for (const entrypoint of [session, state, retailer, integrations, reconciliation, scan]) {
    assert.equal(typeof entrypoint?.fetch, 'function');
  }
});

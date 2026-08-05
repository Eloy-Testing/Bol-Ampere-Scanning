import assert from 'node:assert/strict';
import test from 'node:test';
import retailer from '../../api/retailer.mjs';
import scan from '../../api/scan.mjs';
import session from '../../api/session.mjs';
import state from '../../api/state.mjs';

test('Vercel entrypoints expose Web Standard fetch handlers', () => {
  for (const entrypoint of [session, state, retailer, scan]) {
    assert.equal(typeof entrypoint?.fetch, 'function');
  }
});

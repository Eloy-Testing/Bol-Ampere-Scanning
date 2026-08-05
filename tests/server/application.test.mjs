import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication, createWebRoute } from '../../server/application.mjs';
import { DatabaseError } from '../../server/errors.mjs';
import { hashPassword, signSessionToken } from '../../server/security.mjs';
import { databaseFixture, invoke, mutationHeaders } from './helpers.mjs';

async function configFixture() {
  return {
    sessionSecret: 'session-secret-for-tests-only-1234567890',
    passwordHash: await hashPassword('warehouse password fixture'),
    secureCookies: false,
    sessionTtlSeconds: 3600,
    authWindowSeconds: 900,
    authLockSeconds: 900,
    authFailureLimit: 5,
  };
}

function bolFixture() {
  const shipment = {
    shipmentId: 'SHIPMENT-1',
    shipmentDateTime: '2026-08-05T09:00:00Z',
    order: { orderId: 'ORDER-1', orderPlacedDateTime: '2026-08-05T08:00:00Z' },
    transport: { trackAndTrace: 'TRACK-1', transporterCode: 'TEST' },
    shipmentItems: [{ orderItemId: 'ITEM-1', ean: '8710000000001', quantity: 1 }],
  };
  const order = {
    orderId: 'ORDER-1',
    orderItems: [{ orderItemId: 'ITEM-1', cancellationRequest: false, quantityCancelled: 0 }],
  };
  return {
    getOrdersPage: async (page) => ({ orders: page === 1 ? [{ orderId: 'ORDER-1' }] : [], page }),
    getShipmentsPage: async (page) => ({ shipments: page === 1 ? [shipment] : [], page }),
    getOrder: async () => order,
    getShipment: async () => shipment,
  };
}

function cookiePair(setCookie) {
  return String(setCookie).split(';')[0];
}

test('actual handlers sign in, hydrate, read bol, verify a scan, persist it, and revoke', async (t) => {
  const { repository } = await databaseFixture(t);
  const now = () => new Date('2026-08-05T10:00:00.000Z');
  let id = 0;
  const app = createApplication({
    config: await configFixture(),
    repository,
    bolClient: bolFixture(),
    now,
    requestId: () => `request-${++id}`,
  });

  const login = await invoke(app.session, {
    method: 'POST',
    body: { stationId: 'PACK-01', operatorLabel: 'Alex', password: 'warehouse password fixture' },
    headers: mutationHeaders(),
  });
  assert.equal(login.statusCode, 200);
  assert.equal(login.body.authenticated, true);
  assert.doesNotMatch(String(login.headers['set-cookie']), /warehouse password fixture/);
  const cookie = cookiePair(login.headers['set-cookie']);

  const initial = await invoke(app.state, { method: 'GET', url: '/api/state', headers: { cookie } });
  assert.equal(initial.statusCode, 200);
  assert.equal(initial.body.workday, '2026-08-05');
  assert.deepEqual(initial.body.records, []);

  const retailer = await invoke(app.retailer, {
    method: 'GET',
    url: '/api/retailer?resource=orders&page=1',
    headers: { cookie },
  });
  assert.equal(retailer.statusCode, 200);
  assert.equal(retailer.body.orders[0].orderId, 'ORDER-1');

  const accepted = await invoke(app.scan, {
    method: 'POST',
    url: '/api/scan',
    body: { trackingCode: 'track-1', shipmentId: 'SHIPMENT-1' },
    headers: mutationHeaders(cookie),
  });
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.outcome, 'success');
  assert.equal(accepted.body.counted, true);

  const duplicate = await invoke(app.scan, {
    method: 'POST',
    url: '/api/scan',
    body: { trackingCode: 'TRACK-1', shipmentId: 'SHIPMENT-1' },
    headers: mutationHeaders(cookie),
  });
  assert.equal(duplicate.body.outcome, 'duplicate');
  assert.equal(duplicate.body.counted, false);

  const hydrated = await invoke(app.state, { method: 'GET', url: '/api/state', headers: { cookie } });
  assert.equal(hydrated.body.records.length, 1);
  assert.ok(hydrated.body.scanned['TRACK-1']);

  const logout = await invoke(app.session, {
    method: 'DELETE',
    url: '/api/session',
    headers: mutationHeaders(cookie),
  });
  assert.equal(logout.statusCode, 200);
  assert.match(String(logout.headers['set-cookie']), /Max-Age=0/);
  const afterLogout = await invoke(app.session, { method: 'GET', headers: { cookie } });
  assert.deepEqual(afterLogout.body, { authenticated: false });
});

test('mutations reject cross-origin requests before authentication work', async () => {
  const app = createApplication({
    config: await configFixture(),
    repository: {},
    bolClient: {},
  });
  const response = await invoke(app.session, {
    method: 'POST',
    body: { stationId: 'PACK-01', operatorLabel: 'Alex', password: 'warehouse password fixture' },
    headers: {
      host: 'scanner.test',
      origin: 'https://attacker.test',
      'sec-fetch-site': 'cross-site',
      'content-type': 'application/json',
    },
  });
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: { code: 'forbidden', message: 'Request denied.' } });
});

test('database failures are generic, fail closed, and carry no-store headers', async () => {
  const config = await configFixture();
  const app = createApplication({
    config,
    repository: { getSession: async () => { throw new DatabaseError(); } },
    bolClient: {},
  });
  const signedLookingCookie = `ampere_session=${signSessionToken('a'.repeat(43), config.sessionSecret)}`;
  const response = await invoke(app.state, { method: 'GET', headers: { cookie: signedLookingCookie } });
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error.code, 'database_unavailable');
  assert.equal(response.headers['cache-control'], 'no-store, max-age=0');
});

test('failed logout retains the revocation credential and locks normal session use', async () => {
  const config = await configFixture();
  const token = 'a'.repeat(43);
  const app = createApplication({
    config,
    repository: {
      getSession: async () => ({ tokenHash: token, stationId: 'PACK-01', principalId: 'operator-1' }),
      revokeSession: async () => { throw new DatabaseError(); },
    },
    bolClient: {},
  });
  const response = await invoke(app.session, {
    method: 'DELETE',
    headers: mutationHeaders(`ampere_session=${signSessionToken(token, config.sessionSecret)}`),
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error.code, 'database_unavailable');
  assert.match(response.headers['set-cookie'], /ampere_logout_pending=1/);
  assert.doesNotMatch(response.headers['set-cookie'], /ampere_session=.*Max-Age=0/);

  const pending = await invoke(app.session, {
    method: 'GET',
    headers: { cookie: `ampere_session=${signSessionToken(token, config.sessionSecret)}; ampere_logout_pending=1` },
  });
  assert.deepEqual(pending.body, { authenticated: false, logoutPending: true });
});

test('locked login performs no password work or audit write', async () => {
  const app = createApplication({
    config: await configFixture(),
    repository: {
      getLockout: async () => ({ failedCount: 5, lockedUntil: '2026-08-05T10:15:00.000Z' }),
      recordLockedAttempt: async () => { throw new Error('must not write'); },
    },
    bolClient: {},
    now: () => new Date('2026-08-05T10:00:00.000Z'),
  });
  const response = await invoke(app.session, {
    method: 'POST',
    body: { stationId: 'PACK-01', operatorLabel: 'Alex', password: 'warehouse password fixture' },
    headers: mutationHeaders(),
  });
  assert.equal(response.statusCode, 423);
});

test('route allowlists reject unknown query parameters and methods', async () => {
  const repository = { getSession: async () => ({ tokenHash: 'hash' }) };
  const config = await configFixture();
  const app = createApplication({ config, repository, bolClient: bolFixture() });
  const token = 'a'.repeat(43);
  const cookie = `ampere_session=${signSessionToken(token, config.sessionSecret)}`;
  const invalid = await invoke(app.retailer, {
    method: 'GET',
    url: '/api/retailer?resource=orders&page=1&path=/orders',
    headers: { cookie },
  });
  assert.equal(invalid.statusCode, 400);
  const method = await invoke(app.retailer, { method: 'POST', headers: { cookie } });
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, 'GET');
});

test('Web Standard adapter preserves status, JSON, and repeated cookies', async () => {
  const route = createWebRoute({
    session: async (req, res) => {
      assert.equal(req.method, 'POST');
      assert.equal(req.url, '/api/session?fixture=1');
      assert.equal(req.headers.host, 'scanner.test');
      assert.equal(req.body, '{"ok":true}');
      res.statusCode = 201;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Set-Cookie', ['first=1; Path=/', 'second=2; Path=/']);
      res.end('{"created":true}');
    },
  }, 'session');
  const response = await route(new Request('https://scanner.test/api/session?fixture=1', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"ok":true}',
  }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { created: true });
  assert.match(response.headers.get('set-cookie'), /first=1/);
  assert.match(response.headers.get('set-cookie'), /second=2/);
});

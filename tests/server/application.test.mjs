import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication, createWebRoute, statePayload } from '../../server/application.mjs';
import { BolCredentialsRejectedError, DatabaseError } from '../../server/errors.mjs';
import { hashPassword, signPreference, signSessionToken, tokenHash } from '../../server/security.mjs';
import { databaseFixture, invoke, mutationHeaders } from './helpers.mjs';

async function configFixture() {
  return {
    sessionSecret: 'session-secret-for-tests-only-1234567890',
    passwordHash: await hashPassword('warehouse password fixture'),
    secureCookies: false,
    sessionTtlSeconds: 3600,
    preferenceTtlSeconds: 30 * 24 * 60 * 60,
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

function namedCookiePair(setCookie, name) {
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const match = cookies.find((cookie) => String(cookie).startsWith(`${name}=`));
  return match ? String(match).split(';')[0] : null;
}

test('state projection retains non-secret source provenance for scoped cancellation and STOP rendering', () => {
  const payload = statePayload('2026-08-05', [
    { trackingCode: 'PRIMARY-CANCELLED', orderId: 'ORDER-1', sourceAccount: 'primary', outcome: 'cancelled', cancelledAt: '2026-08-05T10:00:00.000Z', updatedAt: '2026-08-05T10:00:00.000Z' },
    { trackingCode: 'UNVERIFIED', orderId: '', sourceAccount: null, outcome: 'unverified', updatedAt: '2026-08-05T10:01:00.000Z' },
  ]);
  assert.equal(payload.cancelled[0].sourceAccount, 'primary');
  assert.equal(payload.stops[0].sourceAccount, null);
});

test('successful password login alone issues a normalized non-authentication preference', async () => {
  const config = await configFixture();
  let createdSession;
  const app = createApplication({
    config,
    repository: {
      getLockout: async () => null,
      clearAuthFailures: async () => {},
      createSession: async (session) => { createdSession = session; },
    },
    bolClient: {},
    now: () => new Date('2026-08-05T10:00:00.000Z'),
    requestId: () => 'request-preference-login',
  });
  const login = await invoke(app.session, {
    method: 'POST',
    body: { stationId: ' PACK-01 ', operatorLabel: 'Alex   Smith', password: 'warehouse password fixture' },
    headers: mutationHeaders(),
  });
  assert.equal(login.statusCode, 200);
  assert.deepEqual(login.body.session, {
    stationId: 'PACK-01',
    operatorLabel: 'Alex Smith',
    expiresAt: '2026-08-05T11:00:00.000Z',
  });
  assert.equal(createdSession.stationId, 'PACK-01');
  assert.equal(createdSession.operatorLabel, 'Alex Smith');
  assert.deepEqual(
    login.headers['set-cookie'].map((cookie) => String(cookie).split('=')[0]),
    ['ampere_session', 'ampere_preference', 'ampere_logout_pending'],
  );
  assert.doesNotMatch(String(login.headers['set-cookie']), /warehouse password fixture/);

  const preference = namedCookiePair(login.headers['set-cookie'], 'ampere_preference');
  const remembered = await invoke(app.session, { method: 'GET', headers: { cookie: preference } });
  assert.deepEqual(remembered.body, {
    authenticated: false,
    remembered: { stationId: 'PACK-01', operatorLabel: 'Alex Smith' },
  });
  assert.equal(remembered.headers['set-cookie'], undefined);
});

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
  const preference = namedCookiePair(login.headers['set-cookie'], 'ampere_preference');
  assert.ok(preference);

  const initial = await invoke(app.state, { method: 'GET', url: '/api/state', headers: { cookie } });
  assert.equal(initial.statusCode, 200);
  assert.equal(initial.body.workday, '2026-08-05');
  assert.deepEqual(initial.body.records, []);

  const retailer = await invoke(app.retailer, {
    method: 'GET',
    url: '/api/retailer?resource=orders&account=primary&page=1',
    headers: { cookie },
  });
  assert.equal(retailer.statusCode, 200);
  assert.equal(retailer.body.orders[0].orderId, 'ORDER-1');

  const accepted = await invoke(app.scan, {
    method: 'POST',
    url: '/api/scan',
    body: { trackingCode: 'track-1', shipmentId: 'SHIPMENT-1', account: 'primary' },
    headers: mutationHeaders(cookie),
  });
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.outcome, 'success');
  assert.equal(accepted.body.counted, true);
  assert.equal(accepted.body.record.sourceAccount, 'primary');

  const duplicate = await invoke(app.scan, {
    method: 'POST',
    url: '/api/scan',
    body: { trackingCode: 'TRACK-1', shipmentId: 'SHIPMENT-1', account: 'primary' },
    headers: mutationHeaders(cookie),
  });
  assert.equal(duplicate.body.outcome, 'duplicate');
  assert.equal(duplicate.body.counted, false);

  const unknown = await invoke(app.scan, {
    method: 'POST',
    url: '/api/scan',
    body: { trackingCode: 'UNKNOWN' },
    headers: mutationHeaders(cookie),
  });
  assert.equal(unknown.statusCode, 200);
  assert.equal(unknown.body.outcome, 'unknown');
  assert.equal(unknown.body.record.sourceAccount, null);

  const hydrated = await invoke(app.state, { method: 'GET', url: '/api/state', headers: { cookie } });
  assert.equal(hydrated.body.records.length, 2);
  assert.ok(hydrated.body.scanned['TRACK-1']);

  const logout = await invoke(app.session, {
    method: 'DELETE',
    url: '/api/session',
    headers: mutationHeaders(cookie),
  });
  assert.equal(logout.statusCode, 200);
  assert.match(String(logout.headers['set-cookie']), /Max-Age=0/);
  assert.doesNotMatch(String(logout.headers['set-cookie']), /ampere_preference/);
  const afterLogout = await invoke(app.session, { method: 'GET', headers: { cookie: preference } });
  assert.deepEqual(afterLogout.body, {
    authenticated: false,
    remembered: { stationId: 'PACK-01', operatorLabel: 'Alex' },
  });
  assert.equal(afterLogout.headers['set-cookie'], undefined);
});

test('unauthenticated session lookup ignores malformed, tampered, and expired preferences without creating a session', async () => {
  const config = await configFixture();
  const now = () => new Date('2026-08-05T10:00:00.000Z');
  let sessionLookups = 0;
  const app = createApplication({
    config,
    repository: { getSession: async () => { sessionLookups += 1; return null; } },
    bolClient: {},
    now,
  });
  const valid = signPreference(
    { stationId: 'PACK-01', operatorLabel: 'Alex' },
    config.sessionSecret,
    new Date('2026-08-06T10:00:00.000Z'),
  );
  const expired = signPreference(
    { stationId: 'PACK-OLD', operatorLabel: 'Former Operator' },
    config.sessionSecret,
    new Date('2026-08-05T09:59:59.000Z'),
  );

  const remembered = await invoke(app.session, { method: 'GET', headers: { cookie: `ampere_preference=${valid}` } });
  assert.deepEqual(remembered.body, {
    authenticated: false,
    remembered: { stationId: 'PACK-01', operatorLabel: 'Alex' },
  });
  assert.equal(remembered.headers['set-cookie'], undefined);

  for (const value of [`${valid.slice(0, -1)}x`, expired, 'malformed']) {
    const response = await invoke(app.session, { method: 'GET', headers: { cookie: `ampere_preference=${value}` } });
    assert.deepEqual(response.body, { authenticated: false });
    assert.equal(response.headers['set-cookie'], undefined);
  }
  assert.equal(sessionLookups, 0);
});

test('failed password login neither issues nor refreshes a remembered preference', async () => {
  const config = await configFixture();
  const prior = signPreference(
    { stationId: 'PACK-01', operatorLabel: 'Alex' },
    config.sessionSecret,
    new Date('2026-08-06T10:00:00.000Z'),
  );
  const app = createApplication({
    config,
    repository: {
      getLockout: async () => null,
      recordAuthFailure: async () => ({ failedCount: 1, lockedUntil: null }),
    },
    bolClient: {},
    now: () => new Date('2026-08-05T10:00:00.000Z'),
  });
  const response = await invoke(app.session, {
    method: 'POST',
    body: { stationId: 'PACK-02', operatorLabel: 'Mallory', password: 'wrong password' },
    headers: mutationHeaders(`ampere_preference=${prior}`),
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.headers['set-cookie'], undefined);
  assert.doesNotMatch(response.rawBody, /PACK-01|Alex|PACK-02|Mallory|wrong password/);
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

test('failed logout retains auth and preference, blocks normal use, and clears auth only after a successful retry', async () => {
  const config = await configFixture();
  const token = 'a'.repeat(43);
  const signedSession = signSessionToken(token, config.sessionSecret);
  const signedPreference = signPreference(
    { stationId: 'PACK-01', operatorLabel: 'Alex' },
    config.sessionSecret,
    new Date('2026-08-06T10:00:00.000Z'),
  );
  let revokeAttempts = 0;
  let sessionLookups = 0;
  const app = createApplication({
    config,
    repository: {
      getSession: async () => {
        sessionLookups += 1;
        return { tokenHash: tokenHash(token), stationId: 'PACK-01', operatorLabel: 'Alex', principalId: 'operator-1' };
      },
      revokeSession: async () => {
        revokeAttempts += 1;
        if (revokeAttempts === 1) throw new DatabaseError();
      },
    },
    bolClient: {},
    now: () => new Date('2026-08-05T10:00:00.000Z'),
  });
  const initialCookies = `ampere_session=${signedSession}; ampere_preference=${signedPreference}`;
  const response = await invoke(app.session, {
    method: 'DELETE',
    headers: mutationHeaders(initialCookies),
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error.code, 'database_unavailable');
  assert.match(response.headers['set-cookie'], /ampere_logout_pending=1/);
  assert.doesNotMatch(response.headers['set-cookie'], /ampere_session=.*Max-Age=0/);
  assert.doesNotMatch(response.headers['set-cookie'], /ampere_preference/);

  const pending = await invoke(app.session, {
    method: 'GET',
    headers: { cookie: `${initialCookies}; ampere_logout_pending=1` },
  });
  assert.deepEqual(pending.body, {
    authenticated: false,
    logoutPending: true,
    remembered: { stationId: 'PACK-01', operatorLabel: 'Alex' },
  });
  assert.equal(sessionLookups, 1);

  const blocked = await invoke(app.state, {
    method: 'GET',
    headers: { cookie: `${initialCookies}; ampere_logout_pending=1` },
  });
  assert.equal(blocked.statusCode, 401);
  assert.equal(sessionLookups, 1);

  const retried = await invoke(app.session, {
    method: 'DELETE',
    headers: mutationHeaders(`${initialCookies}; ampere_logout_pending=1`),
  });
  assert.equal(retried.statusCode, 200);
  assert.match(String(retried.headers['set-cookie']), /ampere_session=.*Max-Age=0/);
  assert.match(String(retried.headers['set-cookie']), /ampere_logout_pending=.*Max-Age=0/);
  assert.doesNotMatch(String(retried.headers['set-cookie']), /ampere_preference/);
  assert.equal(revokeAttempts, 2);

  const signedOut = await invoke(app.session, {
    method: 'GET',
    headers: { cookie: `ampere_preference=${signedPreference}` },
  });
  assert.deepEqual(signedOut.body, {
    authenticated: false,
    remembered: { stationId: 'PACK-01', operatorLabel: 'Alex' },
  });
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
    url: '/api/retailer?resource=orders&account=primary&page=1&path=/orders',
    headers: { cookie },
  });
  assert.equal(invalid.statusCode, 400);
  const method = await invoke(app.retailer, { method: 'POST', headers: { cookie } });
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, 'GET');
});

test('retailer and scan routes keep the configured source key through secondary verification', async (t) => {
  const { repository } = await databaseFixture(t);
  const calls = [];
  const primary = bolFixture();
  const secondary = {
    ...bolFixture(),
    getOrdersPage: async () => ({ orders: [{ orderId: 'SECONDARY-ORDER' }], page: 1 }),
    getShipment: async (shipmentId) => {
      calls.push(['shipment', shipmentId]);
      return {
        shipmentId,
        shipmentDateTime: '2026-08-05T09:00:00Z',
        order: { orderId: 'SECONDARY-ORDER' },
        transport: { trackAndTrace: 'SECONDARY-TRACK' },
        shipmentItems: [{ orderItemId: 'SECONDARY-ITEM' }],
      };
    },
    getOrder: async (orderId) => {
      calls.push(['order', orderId]);
      return { orderId, orderItems: [{ orderItemId: 'SECONDARY-ITEM', cancellationRequest: false, quantityCancelled: 0 }] };
    },
  };
  const bolClient = {
    accountKeys: () => ['primary', 'secondary'],
    get: (account) => {
      if (account === 'primary') return primary;
      if (account === 'secondary') return secondary;
      throw new Error('unknown source');
    },
  };
  const config = await configFixture();
  const app = createApplication({ config, repository, bolClient, now: () => new Date('2026-08-05T10:00:00.000Z') });
  const token = 'a'.repeat(43);
  await repository.createSession({
    tokenHash: tokenHash(token),
    stationId: 'PACK-01',
    operatorLabel: 'Alex',
    principalId: 'operator-1',
    sourceKey: 'source',
    requestId: 'seed-session',
    now: new Date('2026-08-05T10:00:00.000Z'),
    expiresAt: new Date('2026-08-05T11:00:00.000Z'),
  });
  const cookie = `ampere_session=${signSessionToken(token, config.sessionSecret)}`;
  const accounts = await invoke(app.retailer, { method: 'GET', url: '/api/retailer?resource=accounts', headers: { cookie } });
  assert.deepEqual(accounts.body, { accounts: [
    { key: 'primary', label: 'Bankhoes', kind: 'internal', lastVerifiedAt: null },
    { key: 'secondary', label: 'Muisstil', kind: 'internal', lastVerifiedAt: null },
  ] });
  const accepted = await invoke(app.scan, {
    method: 'POST',
    body: { trackingCode: 'SECONDARY-TRACK', shipmentId: 'SECONDARY-SHIPMENT', account: 'secondary' },
    headers: mutationHeaders(cookie),
  });
  assert.equal(accepted.body.outcome, 'success');
  assert.equal(accepted.body.record.sourceAccount, 'secondary');
  assert.deepEqual(calls, [['shipment', 'SECONDARY-SHIPMENT'], ['order', 'SECONDARY-ORDER']]);
});

test('integration management requires session re-auth and never returns submitted secrets', async (t) => {
  const { repository } = await databaseFixture(t);
  const calls = [];
  const bolAccountService = {
    listAccounts: async () => [
      { key: 'primary', label: 'Bankhoes', kind: 'internal', lastVerifiedAt: null },
      { key: 'secondary', label: 'Muisstil', kind: 'internal', lastVerifiedAt: null },
    ],
    get: async () => bolFixture(),
    connect: async (payload) => {
      calls.push(payload);
      return { key: `acct_${'n'.repeat(22)}`, label: payload.label, kind: 'client', lastVerifiedAt: payload.now.toISOString() };
    },
  };
  const config = await configFixture();
  const app = createApplication({
    config,
    repository,
    bolAccountService,
    now: () => new Date('2026-08-12T09:00:00.000Z'),
    requestId: () => 'request-integrations',
  });
  const login = await invoke(app.session, {
    method: 'POST',
    body: { stationId: 'PACK-01', operatorLabel: 'Alex', password: 'warehouse password fixture' },
    headers: mutationHeaders(),
  });
  const cookie = cookiePair(login.headers['set-cookie']);
  const listed = await invoke(app.integrations, { method: 'GET', url: '/api/integrations', headers: { cookie } });
  assert.equal(listed.statusCode, 200);
  assert.deepEqual(listed.body.accounts.map(({ label }) => label), ['Bankhoes', 'Muisstil']);

  const secret = 'client-secret-not-for-output';
  const created = await invoke(app.integrations, {
    method: 'POST',
    body: { accountName: 'Client North', clientId: 'client-north', clientSecret: secret, password: 'warehouse password fixture' },
    headers: mutationHeaders(cookie),
  });
  assert.equal(created.statusCode, 201);
  assert.deepEqual(created.body.account, {
    key: `acct_${'n'.repeat(22)}`,
    label: 'Client North',
    kind: 'client',
    lastVerifiedAt: '2026-08-12T09:00:00.000Z',
  });
  assert.doesNotMatch(created.rawBody, /client-north|client-secret-not-for-output/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].session.stationId, 'PACK-01');

  const wrongPassword = await invoke(app.integrations, {
    method: 'POST',
    body: { accountName: 'Blocked', clientId: 'client-blocked', clientSecret: secret, password: 'wrong-password' },
    headers: mutationHeaders(cookie),
  });
  assert.equal(wrongPassword.statusCode, 403);
  assert.equal(wrongPassword.body.error.code, 'management_reauth_failed');
  assert.equal(calls.length, 1);
});

test('integration management rejects cross-origin and Bol-rejected connection attempts generically', async (t) => {
  const { repository } = await databaseFixture(t);
  const config = await configFixture();
  const bolAccountService = {
    listAccounts: async () => [{ key: 'primary', label: 'Bankhoes', kind: 'internal', lastVerifiedAt: null }],
    get: async () => bolFixture(),
    connect: async () => { throw new BolCredentialsRejectedError(); },
  };
  const app = createApplication({ config, repository, bolAccountService });
  const login = await invoke(app.session, {
    method: 'POST',
    body: { stationId: 'PACK-01', operatorLabel: 'Alex', password: 'warehouse password fixture' },
    headers: mutationHeaders(),
  });
  const cookie = cookiePair(login.headers['set-cookie']);
  const body = { accountName: 'Rejected', clientId: 'rejected-client', clientSecret: 'rejected-secret', password: 'warehouse password fixture' };
  const crossOrigin = await invoke(app.integrations, {
    method: 'POST',
    body,
    headers: { ...mutationHeaders(cookie), host: 'scanner.test', origin: 'https://attacker.test', 'sec-fetch-site': 'cross-site' },
  });
  assert.equal(crossOrigin.statusCode, 403);
  const rejected = await invoke(app.integrations, { method: 'POST', body, headers: mutationHeaders(cookie) });
  assert.equal(rejected.statusCode, 422);
  assert.equal(rejected.body.error.code, 'bol_credentials_rejected');
  assert.doesNotMatch(rejected.rawBody, /rejected-client|rejected-secret/);
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

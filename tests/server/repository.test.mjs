import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyMigration, applyMigrations, assertAmpereOnly, loadMigrations } from '../../scripts/migrate.mjs';
import { createDatabaseClient } from '../../server/database.mjs';
import { ScannerRepository } from '../../server/repository.mjs';
import { databaseFixture, sessionFixture } from './helpers.mjs';

test('migration is idempotent and creates only ampere application objects', async (t) => {
  const { client } = await databaseFixture(t);
  await applyMigrations({ client, migrations: await loadMigrations() });
  const result = await client.execute("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name");
  assert.ok(result.rows.length >= 10);
  assert.ok(result.rows.every((row) => String(row.name).startsWith('ampere_')));
  const columns = await client.execute('PRAGMA table_info(ampere_package_state)');
  assert.ok(columns.rows.some((row) => row.name === 'source_account'));
  assert.ok(columns.rows.some((row) => row.name === 'source_account_key'));
  const rolloverColumns = await client.execute('PRAGMA table_info(ampere_package_state_v2)');
  assert.ok(rolloverColumns.rows.some((row) => row.name === 'identity_source'));
  assert.ok(rolloverColumns.rows.some((row) => row.name === 'identity_shipment'));
  const eventColumns = await client.execute('PRAGMA table_info(ampere_scan_events)');
  assert.ok(eventColumns.rows.some((row) => row.name === 'source_account_incarnation'));
  const reconciliationTables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ampere_reconciliation_%'");
  assert.ok(reconciliationTables.rows.length >= 5);
});

test('numbered migration upgrades a pre-002 ampere schema exactly once', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ampere-pre-002-test-'));
  const client = createDatabaseClient({ url: `file:${path.join(directory, 'scanner.db')}` });
  t.after(async () => {
    client.close();
    await rm(directory, { recursive: true, force: true });
  });
  const source = await readFile(new URL('../../migrations/001_ampere_scanner.sql', import.meta.url), 'utf8');
  await applyMigration({ client, source });
  await applyMigrations({ client, migrations: await loadMigrations() });
  const ledger = await client.execute('SELECT migration_id FROM ampere_schema_migrations ORDER BY migration_id');
  assert.deepEqual(ledger.rows.map((row) => row.migration_id), [
    '001_ampere_scanner.sql',
    '002_ampere_source_account.sql',
    '003_ampere_dynamic_bol_accounts.sql',
    '004_ampere_rollover_state.sql',
    '005_ampere_daily_reconciliation.sql',
  ]);
});

test('migration guard rejects non-ampere index targets and DML', () => {
  assert.throws(() => assertAmpereOnly([{ sql: 'CREATE INDEX IF NOT EXISTS ampere_bad_idx ON bankhoes_orders(id)' }]));
  assert.throws(() => assertAmpereOnly([{ sql: 'DELETE FROM ampere_sessions' }]));
  assert.throws(() => assertAmpereOnly([{ sql: 'CREATE TABLE IF NOT EXISTS ampere_copy AS SELECT * FROM bankhoes_orders' }]));
  assert.throws(() => assertAmpereOnly([{ sql: 'ALTER TABLE bankhoes_orders ADD COLUMN source_account TEXT' }]));
  for (const target of ['"bankhoes_orders"', '`bankhoes_orders`', '[bankhoes_orders]']) {
    assert.throws(() => assertAmpereOnly([{ sql: `CREATE TABLE IF NOT EXISTS ampere_fk (id INTEGER REFERENCES ${target}(id))` }]));
  }
});

test('shared lockout is persisted by source key and resets after success', async (t) => {
  const { repository } = await databaseFixture(t);
  const now = new Date('2026-08-05T10:00:00.000Z');
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const result = await repository.recordAuthFailure('source-one', now, {
      windowSeconds: 900,
      lockSeconds: 900,
      failureLimit: 5,
    }, { stationLabel: 'PACK-01', operatorLabel: 'Alex', requestId: `request-${attempt}` });
    assert.equal(result.failedCount, attempt);
  }
  assert.deepEqual(await repository.getLockout('source-one', now), {
    failedCount: 5,
    lockedUntil: '2026-08-05T10:15:00.000Z',
  });
  await repository.clearAuthFailures('source-one', now, {
    stationLabel: 'PACK-01', operatorLabel: 'Alex', requestId: 'request-success',
  });
  assert.equal(await repository.getLockout('source-one', now), null);
});

test('database-audited sessions expire and revoke', async (t) => {
  const { client, repository } = await databaseFixture(t);
  await repository.createSession({
    ...sessionFixture(),
    operatorLabel: 'Fixture Operator',
    sourceKey: 'source',
    requestId: 'request-login',
    now: new Date('2026-08-05T10:00:00.000Z'),
    expiresAt: new Date('2026-08-05T11:00:00.000Z'),
  });
  const active = await repository.getSession('token-hash', new Date('2026-08-05T10:30:00.000Z'), 'request-get');
  assert.equal(active.operatorLabel, 'Fixture Operator');
  await repository.revokeSession(active, 'request-logout', new Date('2026-08-05T10:31:00.000Z'));
  assert.equal(await repository.getSession('token-hash', new Date('2026-08-05T10:32:00.000Z'), 'request-after'), null);
  const audit = await client.execute('SELECT action FROM ampere_session_audit ORDER BY event_id');
  assert.deepEqual(audit.rows.map((row) => row.action), ['login_success', 'logout']);
});

test('expired sessions are rejected and audited in the database', async (t) => {
  const { client, repository } = await databaseFixture(t);
  await repository.createSession({
    ...sessionFixture({ tokenHash: 'expired-token' }),
    operatorLabel: 'Fixture Operator',
    sourceKey: 'source',
    requestId: 'request-login',
    now: new Date('2026-08-05T10:00:00.000Z'),
    expiresAt: new Date('2026-08-05T10:30:00.000Z'),
  });
  assert.equal(await repository.getSession('expired-token', new Date('2026-08-05T10:31:00.000Z'), 'request-expired'), null);
  const result = await client.execute("SELECT action FROM ampere_session_audit WHERE action = 'expired'");
  assert.equal(result.rows.length, 1);
});

test('atomic state counts an accepted package once and cancellation cannot be downgraded', async (t) => {
  const { client, url, repository } = await databaseFixture(t);
  const secondClient = createDatabaseClient({ url });
  t.after(() => secondClient.close());
  const secondRepository = new ScannerRepository(secondClient);
  const base = {
    workday: '2026-08-06',
    trackingCode: 'TRACK-1',
    shipmentId: 'SHIPMENT-1',
    orderId: 'ORDER-1',
    sourceAccount: 'primary',
    outcome: 'accepted',
    reason: 'verified_live',
    stationId: 'PACK-01',
    principalId: 'operator-1',
    sessionTokenHash: 'token-hash',
    now: new Date('2026-08-05T15:00:00.000Z'),
  };
  const [first, second] = await Promise.all([
    repository.recordScanDecision({ ...base, requestId: 'request-1' }),
    secondRepository.recordScanDecision({ ...base, requestId: 'request-2' }),
  ]);
  assert.equal([first.changed, second.changed].filter(Boolean).length, 1);
  const cancelled = await repository.recordScanDecision({
    ...base,
    outcome: 'cancelled',
    reason: 'order_item_cancelled',
    requestId: 'request-3',
    now: new Date('2026-08-05T15:01:00.000Z'),
  });
  assert.equal(cancelled.record.outcome, 'cancelled');
  const uncertain = await repository.recordScanDecision({
    ...base,
    outcome: 'unverified',
    reason: 'live_verification_failed',
    requestId: 'request-4',
    now: new Date('2026-08-05T15:02:00.000Z'),
  });
  assert.equal(uncertain.changed, false);
  assert.equal(uncertain.record.outcome, 'cancelled');
  assert.equal(uncertain.record.sourceAccount, 'primary');
  const events = await client.execute('SELECT source_account, attempted_outcome, effective_outcome FROM ampere_scan_events ORDER BY event_id');
  assert.equal(events.rows.length, 4);
  assert.deepEqual(events.rows.at(-1), { source_account: 'primary', attempted_outcome: 'unverified', effective_outcome: 'cancelled' });
});

test('workday rollover projects only the immediately previous terminal package state', async (t) => {
  const { repository } = await databaseFixture(t);
  const base = {
    shipmentId: 'SHIPMENT-ROLLOVER',
    orderId: 'ORDER-ROLLOVER',
    sourceAccount: 'primary',
    reason: 'verified_live',
    stationId: 'PACK-01',
    principalId: 'operator-1',
    sessionTokenHash: 'token-hash',
    now: new Date('2026-08-17T13:59:00.000Z'),
  };
  await repository.recordScanDecision({
    ...base,
    workday: '2026-08-17',
    trackingCode: 'TERMINAL-PREVIOUS',
    outcome: 'accepted',
    requestId: 'request-previous-terminal',
  });
  await repository.recordScanDecision({
    ...base,
    workday: '2026-08-17',
    trackingCode: 'STOP-PREVIOUS',
    shipmentId: null,
    orderId: null,
    sourceAccount: null,
    outcome: 'unverified',
    reason: 'live_verification_failed',
    requestId: 'request-previous-stop',
  });
  await repository.recordScanDecision({
    ...base,
    workday: '2026-08-16',
    trackingCode: 'TERMINAL-TOO-OLD',
    outcome: 'accepted',
    requestId: 'request-too-old',
  });
  await repository.recordScanDecision({
    ...base,
    workday: '2026-08-18',
    trackingCode: 'STOP-CURRENT',
    shipmentId: null,
    orderId: null,
    sourceAccount: null,
    outcome: 'unknown',
    reason: 'not_in_complete_snapshot',
    requestId: 'request-current-stop',
  });

  const state = await repository.getWorkdayState('2026-08-18');
  assert.deepEqual(state.map((record) => [record.trackingCode, record.outcome]).sort(), [
    ['STOP-CURRENT', 'unknown'],
    ['TERMINAL-PREVIOUS', 'accepted'],
  ]);
});

test('pre-migration package history is projected and prevents a rollover recount', async (t) => {
  const { client, repository } = await databaseFixture(t);
  await client.execute({
    sql: `INSERT INTO ampere_package_state
            (workday, tracking_code, shipment_id, order_id, source_account, source_account_key, outcome, reason,
             first_seen_at, accepted_at, cancelled_at, updated_at, station_id, principal_id, session_token_hash, request_id)
          VALUES (?, ?, ?, ?, ?, ?, 'accepted', 'verified_live', ?, ?, NULL, ?, ?, ?, ?, ?)`,
    args: [
      '2026-08-17', 'LEGACY-ROLLOVER', 'LEGACY-SHIPMENT', 'LEGACY-ORDER', 'primary', 'primary',
      '2026-08-17T13:59:00.000Z', '2026-08-17T13:59:00.000Z', '2026-08-17T13:59:00.000Z',
      'PACK-01', 'operator-1', 'token-hash', 'legacy-request',
    ],
  });

  const projected = await repository.getWorkdayState('2026-08-18');
  assert.equal(projected.length, 1);
  assert.equal(projected[0].trackingCode, 'LEGACY-ROLLOVER');
  const duplicate = await repository.recordScanDecision({
    workday: '2026-08-18',
    trackingCode: 'LEGACY-ROLLOVER',
    shipmentId: 'LEGACY-SHIPMENT',
    orderId: 'LEGACY-ORDER',
    sourceAccount: 'primary',
    outcome: 'accepted',
    reason: 'verified_live',
    stationId: 'PACK-02',
    principalId: 'operator-2',
    sessionTokenHash: 'token-hash-2',
    requestId: 'request-after-migration',
    now: new Date('2026-08-17T14:00:01.000Z'),
  });
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.record.outcome, 'accepted');
  assert.equal(duplicate.record.workday, '2026-08-18');
});

test('accepted rollover duplicates stay atomic and can transition only to cancellation', async (t) => {
  const { client, url, repository } = await databaseFixture(t);
  const secondClient = createDatabaseClient({ url });
  t.after(() => secondClient.close());
  const secondRepository = new ScannerRepository(secondClient);
  const base = {
    trackingCode: 'ROLLOVER-DUPLICATE',
    shipmentId: 'SHIPMENT-DUPLICATE',
    orderId: 'ORDER-DUPLICATE',
    sourceAccount: 'primary',
    outcome: 'accepted',
    reason: 'verified_live',
    stationId: 'PACK-01',
    principalId: 'operator-1',
    sessionTokenHash: 'token-hash',
  };
  await repository.recordScanDecision({
    ...base,
    workday: '2026-08-17',
    requestId: 'request-before-cutoff',
    now: new Date('2026-08-17T13:59:59.000Z'),
  });

  const attempts = await Promise.all([
    repository.recordScanDecision({
      ...base,
      workday: '2026-08-18',
      requestId: 'request-after-cutoff-1',
      now: new Date('2026-08-17T14:00:01.000Z'),
    }),
    secondRepository.recordScanDecision({
      ...base,
      workday: '2026-08-18',
      stationId: 'PACK-02',
      requestId: 'request-after-cutoff-2',
      now: new Date('2026-08-17T14:00:02.000Z'),
    }),
  ]);
  assert.deepEqual(attempts.map((attempt) => attempt.changed), [false, false]);
  assert.ok(attempts.every((attempt) => attempt.record.outcome === 'accepted'));

  const cancelled = await repository.recordScanDecision({
    ...base,
    workday: '2026-08-18',
    outcome: 'cancelled',
    reason: 'order_item_cancelled',
    requestId: 'request-cancelled',
    now: new Date('2026-08-17T14:01:00.000Z'),
  });
  assert.equal(cancelled.changed, true);
  assert.equal(cancelled.record.outcome, 'cancelled');

  const uncertain = await repository.recordScanDecision({
    ...base,
    workday: '2026-08-18',
    outcome: 'unverified',
    reason: 'live_verification_failed',
    requestId: 'request-after-cancellation',
    now: new Date('2026-08-17T14:02:00.000Z'),
  });
  assert.equal(uncertain.changed, false);
  assert.equal(uncertain.record.outcome, 'cancelled');

  const events = await client.execute({
    sql: `SELECT attempted_outcome, effective_outcome
          FROM ampere_scan_events WHERE workday = ? AND tracking_code = ? ORDER BY event_id`,
    args: ['2026-08-18', 'ROLLOVER-DUPLICATE'],
  });
  assert.deepEqual(events.rows, [
    { attempted_outcome: 'accepted', effective_outcome: 'accepted' },
    { attempted_outcome: 'accepted', effective_outcome: 'accepted' },
    { attempted_outcome: 'cancelled', effective_outcome: 'cancelled' },
    { attempted_outcome: 'unverified', effective_outcome: 'cancelled' },
  ]);
});

test('rollover identity keeps dynamic accounts and shipment packages distinct', async (t) => {
  const { repository } = await databaseFixture(t);
  const accountOne = `acct_${'a'.repeat(22)}`;
  const accountTwo = `acct_${'b'.repeat(22)}`;
  const base = {
    trackingCode: 'SHARED-TRACKING-CODE',
    orderId: 'ORDER-SHARED',
    outcome: 'accepted',
    reason: 'verified_live',
    stationId: 'PACK-01',
    principalId: 'operator-1',
    sessionTokenHash: 'token-hash',
    now: new Date('2026-08-17T13:59:00.000Z'),
  };
  await repository.recordScanDecision({
    ...base,
    workday: '2026-08-17',
    shipmentId: 'SHIPMENT-A1',
    sourceAccount: accountOne,
    requestId: 'request-account-one-previous',
  });
  const differentAccount = await repository.recordScanDecision({
    ...base,
    workday: '2026-08-18',
    shipmentId: 'SHIPMENT-A1',
    sourceAccount: accountTwo,
    requestId: 'request-account-two-current',
  });
  const differentShipment = await repository.recordScanDecision({
    ...base,
    workday: '2026-08-18',
    shipmentId: 'SHIPMENT-A2',
    sourceAccount: accountOne,
    requestId: 'request-account-one-second-shipment',
  });
  const exactDuplicate = await repository.recordScanDecision({
    ...base,
    workday: '2026-08-18',
    shipmentId: 'SHIPMENT-A1',
    sourceAccount: accountOne,
    requestId: 'request-account-one-duplicate',
  });

  assert.equal(differentAccount.changed, true);
  assert.equal(differentShipment.changed, true);
  assert.equal(exactDuplicate.changed, false);
  const identities = (await repository.getWorkdayState('2026-08-18'))
    .map((record) => [record.sourceAccount, record.shipmentId, record.outcome])
    .sort((left, right) => left.join(':').localeCompare(right.join(':')));
  assert.deepEqual(identities, [
    [accountOne, 'SHIPMENT-A1', 'accepted'],
    [accountOne, 'SHIPMENT-A2', 'accepted'],
    [accountTwo, 'SHIPMENT-A1', 'accepted'],
  ]);
});

test('dynamic account provenance and encrypted account metadata persist in ampere-only tables', async (t) => {
  const { client, repository } = await databaseFixture(t);
  const accountKey = `acct_${'z'.repeat(22)}`;
  const envelope = {
    envelopeVersion: 1,
    credentialCiphertext: 'ciphertext-value',
    credentialIv: 'iv-value',
    credentialTag: 'tag-value',
    credentialFingerprint: 'fingerprint-value',
  };
  const saved = await repository.saveBolAccount({
    accountKey,
    label: 'Client South',
    accountKind: 'client',
    envelope,
    stationId: 'PACK-01',
    principalId: 'operator-fixture',
    requestId: 'request-account-create',
    action: 'created',
    now: new Date('2026-08-12T09:00:00.000Z'),
  });
  assert.equal(saved.accountKey, accountKey);
  assert.equal(saved.revision, 1);
  assert.equal((await repository.findBolAccountByFingerprint('fingerprint-value')).label, 'Client South');

  const scan = await repository.recordScanDecision({
    workday: '2026-08-12',
    trackingCode: 'CLIENT-TRACK',
    shipmentId: 'CLIENT-SHIPMENT',
    orderId: 'CLIENT-ORDER',
    sourceAccount: accountKey,
    outcome: 'accepted',
    reason: 'verified_live',
    stationId: 'PACK-01',
    principalId: 'operator-fixture',
    sessionTokenHash: 'token-hash',
    requestId: 'request-client-scan',
    now: new Date('2026-08-12T09:01:00.000Z'),
  });
  assert.equal(scan.record.sourceAccount, accountKey);
  const event = await client.execute({
    sql: 'SELECT source_account, source_account_key FROM ampere_scan_events WHERE tracking_code = ?',
    args: ['CLIENT-TRACK'],
  });
  assert.deepEqual(event.rows[0], { source_account: null, source_account_key: accountKey });
  const audit = await client.execute('SELECT action, account_key, label FROM ampere_bol_account_audit');
  assert.deepEqual(audit.rows[0], { action: 'created', account_key: accountKey, label: 'Client South' });
});

test('daily reconciliation joins immutable scan identity and exposes late adjustments without rewriting close', async (t) => {
  const { repository } = await databaseFixture(t);
  const account = { key: 'primary', label: 'Bankhoes', incarnation: 'bol_incarnation_primary' };
  const parcel = ({ trackingCode, shipmentId, orderId, sourceCreatedAt, cancelled = false }) => ({
    accountKey: account.key,
    accountLabel: account.label,
    accountIncarnation: account.incarnation,
    trackingCode,
    sourceWorkday: '2026-08-05',
    sourceCreatedAt,
    cancelled,
    shipments: [{
      shipmentId,
      orderId,
      shipmentDateTime: sourceCreatedAt,
      itemFingerprint: `fingerprint-${shipmentId}`,
      items: [{ orderItemId: `ITEM-${shipmentId}`, cancelled }],
    }],
  });
  const firstPackages = [
    parcel({ trackingCode: 'TRACK-SCANNED', shipmentId: 'SHIPMENT-1', orderId: 'ORDER-1', sourceCreatedAt: '2026-08-05T09:00:00.000Z' }),
    parcel({ trackingCode: 'TRACK-CANCELLED', shipmentId: 'SHIPMENT-2', orderId: 'ORDER-2', sourceCreatedAt: '2026-08-05T09:05:00.000Z', cancelled: true }),
  ];
  await repository.recordReconciliationSnapshot({
    runId: 'run-current', workday: '2026-08-05', closeWorkday: '2026-08-04', accounts: [account], packages: firstPackages,
    startedAt: new Date('2026-08-05T10:00:00.000Z'), completedAt: new Date('2026-08-05T10:01:00.000Z'),
  });
  await repository.recordScanDecision({
    workday: '2026-08-05',
    trackingCode: 'TRACK-SCANNED',
    shipmentId: 'SHIPMENT-1',
    orderId: 'ORDER-1',
    sourceAccount: account.key,
    sourceAccountIncarnation: account.incarnation,
    outcome: 'accepted',
    reason: 'verified_live',
    stationId: 'PACK-01',
    principalId: 'operator-1',
    sessionTokenHash: 'token-hash',
    requestId: 'scan-current',
    now: new Date('2026-08-05T10:05:00.000Z'),
  });
  await repository.recordReconciliationSnapshot({
    runId: 'run-close', workday: '2026-08-06', closeWorkday: '2026-08-05', accounts: [account], packages: firstPackages,
    startedAt: new Date('2026-08-05T14:01:00.000Z'), completedAt: new Date('2026-08-05T14:01:30.000Z'),
  });
  const closed = await repository.getReconciliationReport({
    workday: '2026-08-05', accountKey: account.key, accountLabel: account.label, accountIncarnation: account.incarnation,
  });
  assert.deepEqual(closed.metrics, { observed: 2, cancelled: 1, expected: 1, scanned: 1, missing: 0, adjustments: 0 });
  assert.equal(closed.closedAt, '2026-08-05T14:01:30.000Z');
  assert.equal(closed.rows.find((row) => row.trackingCode === 'TRACK-SCANNED').identityQuality, 'exact');

  const late = parcel({
    trackingCode: 'TRACK-LATE', shipmentId: 'SHIPMENT-3', orderId: 'ORDER-3', sourceCreatedAt: '2026-08-05T13:59:00.000Z',
  });
  await repository.recordReconciliationSnapshot({
    runId: 'run-late', workday: '2026-08-06', closeWorkday: '2026-08-05', accounts: [account], packages: [...firstPackages, late],
    startedAt: new Date('2026-08-05T14:10:00.000Z'), completedAt: new Date('2026-08-05T14:10:30.000Z'),
  });
  const adjusted = await repository.getReconciliationReport({
    workday: '2026-08-05', accountKey: account.key, accountLabel: account.label, accountIncarnation: account.incarnation,
  });
  assert.equal(adjusted.closedAt, closed.closedAt);
  assert.deepEqual(adjusted.metrics, { observed: 3, cancelled: 1, expected: 2, scanned: 1, missing: 1, adjustments: 1 });
  assert.equal(adjusted.rows.find((row) => row.trackingCode === 'TRACK-LATE').adjustment, true);
});

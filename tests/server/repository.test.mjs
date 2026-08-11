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
  assert.deepEqual(ledger.rows.map((row) => row.migration_id), ['001_ampere_scanner.sql', '002_ampere_source_account.sql']);
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

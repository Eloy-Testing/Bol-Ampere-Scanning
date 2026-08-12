import assert from 'node:assert/strict';
import test from 'node:test';
import { BolAccountService } from '../../server/bol-account-service.mjs';
import { CredentialVault } from '../../server/credential-vault.mjs';
import { BolCredentialsRejectedError } from '../../server/errors.mjs';
import { databaseFixture, sessionFixture } from './helpers.mjs';

const encryptionKey = Buffer.alloc(32, 23).toString('base64url');
const staticAccounts = [
  { key: 'primary', label: 'Bankhoes', clientId: 'primary-client', clientSecret: 'primary-secret' },
  { key: 'secondary', label: 'Muisstil', clientId: 'secondary-client', clientSecret: 'secondary-secret' },
];

function client(credentials, { reject = false } = {}) {
  return {
    credentials,
    verifyConnection: async () => {
      if (reject) throw new BolCredentialsRejectedError();
      return true;
    },
    getOrdersPage: async () => ({ orders: [] }),
    getShipmentsPage: async () => ({ shipments: [] }),
    getOrder: async () => ({}),
    getShipment: async () => ({}),
  };
}

function connectContext() {
  return {
    session: sessionFixture(),
    requestId: 'request-connect',
    now: new Date('2026-08-12T09:00:00.000Z'),
  };
}

test('new Bol account is verified, encrypted, audited, and exposed only as metadata', async (t) => {
  const { client: database, repository } = await databaseFixture(t);
  const candidates = [];
  const service = new BolAccountService({
    repository,
    staticAccounts,
    vault: new CredentialVault(encryptionKey),
    nodeEnv: 'test',
    clientFactory: (credentials) => {
      const created = client(credentials);
      candidates.push(created);
      return created;
    },
  });
  assert.deepEqual((await service.listAccounts()).map(({ key, label }) => ({ key, label })), [
    { key: 'primary', label: 'Bankhoes' },
    { key: 'secondary', label: 'Muisstil' },
  ]);

  const saved = await service.connect({
    label: 'Client North',
    clientId: 'north-client',
    clientSecret: 'north-secret-value',
    ...connectContext(),
  });
  assert.match(saved.key, /^acct_[A-Za-z0-9_-]{22}$/);
  assert.deepEqual({ label: saved.label, kind: saved.kind }, { label: 'Client North', kind: 'client' });
  assert.equal(Object.hasOwn(saved, 'clientId'), false);
  assert.equal(Object.hasOwn(saved, 'clientSecret'), false);
  assert.equal((await service.get(saved.key)).credentials.clientSecret, 'north-secret-value');

  const raw = await database.execute('SELECT * FROM ampere_bol_accounts WHERE account_key = ?', [saved.key]);
  assert.equal(raw.rows.length, 1);
  assert.doesNotMatch(JSON.stringify(raw.rows[0]), /north-client|north-secret-value/);
  const audit = await database.execute('SELECT action, label, station_id, principal_id, request_id FROM ampere_bol_account_audit');
  assert.deepEqual(audit.rows[0], {
    action: 'created', label: 'Client North', station_id: 'PACK-01', principal_id: 'operator-fixture', request_id: 'request-connect',
  });
  assert.doesNotMatch(JSON.stringify(audit.rows[0]), /north-client|north-secret-value/);
  assert.equal(candidates.length, 1);
});

test('internal credential updates preserve the stable key and environment fallback', async (t) => {
  const { repository } = await databaseFixture(t);
  const service = new BolAccountService({
    repository,
    staticAccounts,
    vault: new CredentialVault(encryptionKey),
    nodeEnv: 'test',
    clientFactory: (credentials) => client(credentials),
  });
  assert.equal((await service.get('primary')).credentials.clientId, 'primary-client');
  const updated = await service.connect({
    accountKey: 'primary',
    clientId: 'primary-client-updated',
    clientSecret: 'primary-secret-updated',
    ...connectContext(),
  });
  assert.deepEqual({ key: updated.key, label: updated.label, kind: updated.kind }, {
    key: 'primary', label: 'Bankhoes', kind: 'internal',
  });
  assert.equal((await service.get('primary')).credentials.clientId, 'primary-client-updated');
});

test('duplicate or rejected credentials leave no managed account behind', async (t) => {
  const { repository } = await databaseFixture(t);
  const service = new BolAccountService({
    repository,
    staticAccounts,
    vault: new CredentialVault(encryptionKey),
    nodeEnv: 'test',
    clientFactory: (credentials) => client(credentials, { reject: credentials.clientId === 'rejected-client' }),
  });
  await assert.rejects(() => service.connect({
    label: 'Duplicate', clientId: 'primary-client', clientSecret: 'not-relevant', ...connectContext(),
  }), { code: 'bol_account_duplicate' });
  await assert.rejects(() => service.connect({
    label: 'Rejected', clientId: 'rejected-client', clientSecret: 'rejected-secret', ...connectContext(),
  }), { code: 'bol_credentials_rejected' });
  assert.equal((await repository.listBolAccountRecords()).length, 0);
});

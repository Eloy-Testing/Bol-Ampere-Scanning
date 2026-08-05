import assert from 'node:assert/strict';
import test from 'node:test';
import { databaseConfig, loadConfig } from '../../server/config.mjs';
import { hashPassword } from '../../server/security.mjs';

test('configuration permits tokenless local libSQL but requires all server-only secrets', async () => {
  const complete = {
    NODE_ENV: 'test',
    TURSO_DATABASE_URL: 'file:./local.db',
    BOL_CLIENT_ID: 'client',
    BOL_CLIENT_SECRET: 'secret',
    WAREHOUSE_PASSWORD_HASH: await hashPassword('warehouse password fixture'),
    SESSION_SECRET: 's'.repeat(32),
  };
  assert.equal(loadConfig(complete).databaseToken, undefined);
  assert.throws(() => loadConfig({ ...complete, TURSO_DATABASE_URL: 'libsql://remote.example' }), {
    name: 'ConfigurationError',
  });
  assert.throws(() => databaseConfig({ TURSO_DATABASE_URL: 'libsql://other-database.turso.io', TURSO_AUTH_TOKEN: 'token' }), {
    name: 'ConfigurationError',
  });
  assert.deepEqual(databaseConfig({
    TURSO_DATABASE_URL: 'libsql://bankhoes-bi-data-zanderbmc.aws-eu-west-1.turso.io',
    TURSO_AUTH_TOKEN: 'token',
  }), {
    url: 'libsql://bankhoes-bi-data-zanderbmc.aws-eu-west-1.turso.io',
    authToken: 'token',
  });
  assert.throws(() => loadConfig({ ...complete, WAREHOUSE_PASSWORD_HASH: 'malformed' }), {
    name: 'ConfigurationError',
  });
});

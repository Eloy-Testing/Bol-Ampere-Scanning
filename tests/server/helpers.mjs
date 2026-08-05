import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDatabaseClient } from '../../server/database.mjs';
import { ScannerRepository } from '../../server/repository.mjs';
import { applyMigration } from '../../scripts/migrate.mjs';

export async function databaseFixture(test) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ampere-server-test-'));
  const url = `file:${path.join(directory, 'scanner.db')}`;
  const client = createDatabaseClient({ url });
  const migration = await readFile(new URL('../../migrations/001_ampere_scanner.sql', import.meta.url), 'utf8');
  await applyMigration({ client, source: migration });
  test.after(async () => {
    client.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { client, url, repository: new ScannerRepository(client) };
}

export function sessionFixture(overrides = {}) {
  return {
    tokenHash: 'token-hash',
    stationId: 'PACK-01',
    principalId: 'operator-fixture',
    operatorLabel: 'Fixture Operator',
    expiresAt: '2026-08-05T18:00:00.000Z',
    ...overrides,
  };
}

export function mockRequest({ method = 'GET', url = '/', body, headers = {}, address = '192.0.2.10' } = {}) {
  return {
    method,
    url,
    body,
    headers,
    socket: { remoteAddress: address, encrypted: false },
    async *[Symbol.asyncIterator]() {},
  };
}

export function mockResponse() {
  return {
    statusCode: 0,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value = '') {
      this.rawBody = value;
      try { this.body = value ? JSON.parse(value) : null; } catch { this.body = value; }
    },
  };
}

export async function invoke(handler, options) {
  const req = mockRequest(options);
  const res = mockResponse();
  await handler(req, res);
  return res;
}

export function mutationHeaders(cookie) {
  return {
    host: 'scanner.test',
    origin: 'http://scanner.test',
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/json',
    ...(cookie ? { cookie } : {}),
  };
}

import { createClient as createNodeClient } from '@libsql/client';
import { createClient as createWebClient } from '@libsql/client/web';
import { DatabaseError } from './errors.mjs';

export function createDatabaseClient({ url, authToken }) {
  const createClient = url.startsWith('file:') ? createNodeClient : createWebClient;
  return createClient({ url, ...(authToken ? { authToken } : {}) });
}

export async function verifyAmpereSchema(client) {
  try {
    const result = await client.execute({
      sql: `SELECT name FROM sqlite_master
            WHERE type IN ('table', 'index') AND name GLOB 'ampere_*'
            ORDER BY name`,
      args: [],
    });
    return result.rows.map((row) => String(row.name));
  } catch {
    throw new DatabaseError();
  }
}

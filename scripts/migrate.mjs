#!/usr/bin/env node
import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { databaseConfig } from '../server/config.mjs';
import { createDatabaseClient, verifyAmpereSchema } from '../server/database.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDirectory = path.join(projectRoot, 'migrations');
const MIGRATION_FILE = /^(\d+)_ampere_[a-z0-9_-]+\.sql$/;
const MIGRATION_LEDGER_SQL = `CREATE TABLE IF NOT EXISTS ampere_schema_migrations (
  migration_id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
)`;

export function splitSql(source) {
  return source
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((sql) => ({ sql, args: [] }));
}

export function assertAmpereOnly(statements) {
  for (const { sql } of statements) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    const table = normalized.match(/^CREATE TABLE IF NOT EXISTS ([A-Za-z0-9_]+)\s*\(/i);
    const index = normalized.match(/^CREATE INDEX IF NOT EXISTS ([A-Za-z0-9_]+) ON ([A-Za-z0-9_]+)\s*\(/i);
    const alter = normalized.match(/^ALTER TABLE ([A-Za-z0-9_]+) ADD COLUMN ([A-Za-z0-9_]+)\s+/i);
    const names = table ? [table[1]] : index ? [index[1], index[2]] : alter ? [alter[1]] : [];
    const referenceKeywords = [...normalized.matchAll(/\bREFERENCES\b/gi)];
    const references = [...normalized.matchAll(/\bREFERENCES\s+("[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z0-9_]+)/gi)];
    if (references.length !== referenceKeywords.length) {
      throw new Error('Migration crossed the ampere namespace boundary.');
    }
    names.push(...references.map((match) => match[1].replace(/^(?:"|`|\[)|(?:"|`|\])$/g, '')));
    const queryBearing = /\b(?:SELECT|FROM|JOIN|INSERT|UPDATE|DELETE|ATTACH|DETACH|PRAGMA)\b/i.test(normalized);
    if (queryBearing || names.length === 0 || names.some((name) => !name.startsWith('ampere_'))) {
      throw new Error('Migration crossed the ampere namespace boundary.');
    }
  }
}

async function prepareLocalDirectory(url) {
  if (!url.startsWith('file:')) return;
  let filename;
  if (url.startsWith('file://')) filename = fileURLToPath(url);
  else filename = path.resolve(projectRoot, url.slice('file:'.length));
  await mkdir(path.dirname(filename), { recursive: true });
}

export async function applyMigration({ client, source }) {
  const statements = splitSql(source);
  assertAmpereOnly(statements);
  await client.batch(statements, 'write');
  return verifyAmpereSchema(client);
}

export async function loadMigrations() {
  const entries = await readdir(migrationsDirectory);
  const migrationIds = entries
    .filter((entry) => MIGRATION_FILE.test(entry))
    .sort((left, right) => left.localeCompare(right, 'en'));
  if (migrationIds.length === 0) throw new Error('No ampere migrations found.');
  return Promise.all(migrationIds.map(async (id) => ({
    id,
    source: await readFile(path.join(migrationsDirectory, id), 'utf8'),
  })));
}

function validateMigrationList(migrations) {
  if (!Array.isArray(migrations) || migrations.length === 0) throw new Error('No ampere migrations found.');
  const ids = new Set();
  for (const migration of migrations) {
    if (!migration || typeof migration.id !== 'string' || !MIGRATION_FILE.test(migration.id) || ids.has(migration.id)
      || typeof migration.source !== 'string') throw new Error('Invalid ampere migration sequence.');
    ids.add(migration.id);
  }
}

export async function applyMigrations({ client, migrations }) {
  validateMigrationList(migrations);
  await client.execute({ sql: MIGRATION_LEDGER_SQL, args: [] });
  const existing = await client.execute({ sql: 'SELECT migration_id FROM ampere_schema_migrations', args: [] });
  const applied = new Set(existing.rows.map((row) => String(row.migration_id)));
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    const statements = splitSql(migration.source);
    assertAmpereOnly(statements);
    await client.batch([
      ...statements,
      {
        sql: 'INSERT INTO ampere_schema_migrations (migration_id, applied_at) VALUES (?, ?)',
        args: [migration.id, new Date().toISOString()],
      },
    ], 'write');
  }
  return verifyAmpereSchema(client);
}

export async function main(env = process.env) {
  let client;
  try {
    const config = databaseConfig(env);
    await prepareLocalDirectory(config.url);
    client = createDatabaseClient(config);
    const objects = await applyMigrations({ client, migrations: await loadMigrations() });
    process.stdout.write(`Verified ${objects.length} ampere schema objects.\n`);
  } catch {
    process.stderr.write('Ampere migration failed without changing any non-Ampere schema.\n');
    process.exitCode = 1;
  } finally {
    client?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

#!/usr/bin/env node
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { databaseConfig } from '../server/config.mjs';
import { createDatabaseClient, verifyAmpereSchema } from '../server/database.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(projectRoot, 'migrations', '001_ampere_scanner.sql');

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
    const names = table ? [table[1]] : index ? [index[1], index[2]] : [];
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

export async function main(env = process.env) {
  let client;
  try {
    const config = databaseConfig(env);
    await prepareLocalDirectory(config.url);
    const source = await readFile(migrationPath, 'utf8');
    client = createDatabaseClient(config);
    const objects = await applyMigration({ client, source });
    process.stdout.write(`Verified ${objects.length} ampere schema objects.\n`);
  } catch {
    process.stderr.write('Ampere migration failed without changing any non-Ampere schema.\n');
    process.exitCode = 1;
  } finally {
    client?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

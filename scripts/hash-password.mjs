#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { hashPassword } from '../server/security.mjs';

async function readPassword(stream = process.stdin) {
  let value = '';
  for await (const chunk of stream) {
    value += chunk.toString('utf8');
    if (Buffer.byteLength(value) > 4096) throw new Error('Password input is too long.');
  }
  return value.replace(/\r?\n$/, '');
}

export async function main() {
  if (process.stdin.isTTY) {
    process.stderr.write('Provide the warehouse password on standard input.\n');
    process.exitCode = 2;
    return;
  }
  try {
    const password = await readPassword();
    process.stdout.write(`${await hashPassword(password)}\n`);
  } catch {
    process.stderr.write('Could not hash the supplied password.\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

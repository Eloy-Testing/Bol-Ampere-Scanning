import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('repository contains one canonical HTML entry point and no operational debris', async () => {
  const files = await readdir(root);
  await expect(access(resolve(root, 'index.html'), constants.R_OK)).resolves.toBeUndefined();
  expect(files.filter((name) => name.endsWith('.html'))).toEqual(['index.html']);
  expect(files).not.toContain('debug.jsonl');
  expect(files).not.toContain('thumbnail.png');
  expect(files.filter((name) => /^\d{10,}\.html$/.test(name))).toEqual([]);
});

test('production entry point does not import remote scripts or styles', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  expect(html).not.toMatch(/<(?:script|link)\b[^>]+(?:src|href)=["']https?:\/\//i);
});

test('production entry point has no artifact bridge or operational browser storage', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  expect(html).not.toContain(['window', 'cowork'].join('.'));
  expect(html).not.toMatch(/mcp__/i);
  expect(html).not.toContain('cowork-artifact-meta');
  const storageCalls = html.match(/localStorage\.(?:getItem|setItem)\([^)]+\)/g) || [];
  expect(storageCalls).toHaveLength(2);
  expect(storageCalls.every((call) => call.includes('LANGUAGE_KEY'))).toBe(true);
});

test('browser traffic is constrained to same-origin application routes', async () => {
  const html = await readFile(resolve(root, 'index.html'), 'utf8');
  const fetchTargets = [...html.matchAll(/(?:fetch|requestJson)\((['"`])([^'"`]+)\1/g)].map((match) => match[2]);
  expect(fetchTargets.length).toBeGreaterThan(0);
  expect(fetchTargets.every((target) => target.startsWith('/api/'))).toBe(true);
});

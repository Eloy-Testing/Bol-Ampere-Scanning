#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDirectory = path.join(root, 'verification', 'screenshot-evidence');
const origin = process.env.SCANNER_ORIGIN || 'http://127.0.0.1:4188';
const paths = {
  login: path.join(evidenceDirectory, '2026-08-05-standalone-vercel-scanner-login.png'),
  desktop: path.join(evidenceDirectory, '2026-08-05-standalone-vercel-scanner-desktop.png'),
  mobile: path.join(evidenceDirectory, '2026-08-05-standalone-vercel-scanner-mobile.png'),
};

await mkdir(evidenceDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const runtimeErrors = [];
page.on('pageerror', (error) => runtimeErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.push(message.text());
});

try {
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="access-gate"]').waitFor({ state: 'visible' });
  await page.screenshot({ path: paths.login, fullPage: true });

  await page.locator('#stationId').fill('PACK-VISUAL');
  await page.locator('#operatorLabel').fill('Visual QA');
  await page.locator('#warehousePassword').fill('warehouse password fixture');
  await page.locator('#loginButton').click();
  await page.locator('#scanInput').waitFor({ state: 'visible' });
  await page.locator('#scanInput').waitFor({ state: 'attached' });
  await page.waitForFunction(() => !document.querySelector('#scanInput')?.disabled);

  await page.locator('#scanInput').fill('TRACK-REAL-1');
  await page.locator('#scanInput').press('Enter');
  await page.locator('[data-testid="scan-feedback"]').filter({ hasText: /GO|cleared/i }).waitFor();
  await page.screenshot({ path: paths.desktop, fullPage: true });

  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator('#scanInput').fill('UNKNOWN-VISUAL');
  await page.locator('#scanInput').press('Enter');
  await page.locator('[data-testid="scan-feedback"]').filter({ hasText: /STOP|do not send/i }).waitFor();
  await page.screenshot({ path: paths.mobile, fullPage: true });

  if (runtimeErrors.length) throw new Error(`Browser errors: ${runtimeErrors.join(' | ')}`);
  process.stdout.write(`${JSON.stringify({ origin, paths, runtimeErrors }, null, 2)}\n`);
} finally {
  await browser.close();
}

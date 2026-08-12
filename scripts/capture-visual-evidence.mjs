#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDirectory = path.join(root, 'verification', 'screenshot-evidence');
const origin = process.env.SCANNER_ORIGIN || 'http://127.0.0.1:4188';
const paths = {
  login: path.join(evidenceDirectory, '2026-08-12-dynamic-bol-scanner-login.png'),
  desktop: path.join(evidenceDirectory, '2026-08-12-dynamic-bol-scanner-desktop.png'),
  mobile: path.join(evidenceDirectory, '2026-08-12-dynamic-bol-scanner-mobile.png'),
  connectionsDesktop: path.join(evidenceDirectory, '2026-08-12-dynamic-bol-connections-desktop.png'),
  connectionFormDesktop: path.join(evidenceDirectory, '2026-08-12-dynamic-bol-connection-form-desktop.png'),
  connectionFormMobile: path.join(evidenceDirectory, '2026-08-12-dynamic-bol-connection-form-mobile.png'),
  connectionSuccessDesktop: path.join(evidenceDirectory, '2026-08-12-dynamic-bol-connection-success-desktop.png'),
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

  await page.locator('[data-testid="connections-button"]').click();
  await page.locator('[data-testid="add-account-button"]').waitFor({ state: 'visible' });
  await page.screenshot({ path: paths.connectionsDesktop });
  await page.locator('[data-testid="add-account-button"]').click();
  await page.locator('#accountName').waitFor({ state: 'visible' });
  await page.screenshot({ path: paths.connectionFormDesktop });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: paths.connectionFormMobile });
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.locator('#accountName').fill('Client North');
  await page.locator('#bolClientId').fill('empty-client');
  await page.locator('#bolClientSecret').fill('synthetic-client-secret');
  await page.locator('#integrationPassword').fill('warehouse password fixture');
  await page.locator('#integrationSaveButton').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="integration-overview-status"]')?.dataset.tone === 'success');
  await page.waitForFunction(() => document.querySelector('[data-testid^="account-tab-acct_"]')?.textContent?.includes('Client North'));
  await page.screenshot({ path: paths.connectionSuccessDesktop });
  await page.locator('#integrationCloseButton').click();
  await page.waitForFunction(() => document.activeElement?.id === 'scanInput' && !document.querySelector('#scanInput')?.disabled);

  await page.locator('#scanInput').fill('TRACK-REAL-1');
  await page.locator('#scanInput').press('Enter');
  await page.waitForFunction(() => ['success', 'duplicate'].includes(document.querySelector('[data-testid="scan-feedback"]')?.dataset.kind));
  await page.screenshot({ path: paths.desktop, fullPage: true });

  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator('#scanInput').fill('UNKNOWN-VISUAL');
  await page.locator('#scanInput').press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-testid="scan-feedback"]')?.dataset.kind === 'stop');
  await page.screenshot({ path: paths.mobile, fullPage: true });

  if (runtimeErrors.length) throw new Error(`Browser errors: ${runtimeErrors.join(' | ')}`);
  process.stdout.write(`${JSON.stringify({ origin, paths, runtimeErrors }, null, 2)}\n`);
} finally {
  await browser.close();
}

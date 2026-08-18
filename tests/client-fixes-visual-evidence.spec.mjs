import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, selectors, waitForReady, scan } from './fixtures/mock-bol.mjs';
import { healthyScenario, orderSummary, parcel, snapshot } from './fixtures/data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDirectory = path.join(root, 'verification', 'screenshot-evidence');
const screenshots = {
  login: path.join(evidenceDirectory, '2026-08-18-client-fixes-remembered-login-desktop.png'),
  desktop: path.join(evidenceDirectory, '2026-08-18-client-fixes-package-metrics-desktop.png'),
  mobile: path.join(evidenceDirectory, '2026-08-18-client-fixes-package-metrics-mobile.png'),
};

const parcels = [
  parcel({ n: 1, track: 'ACCEPTED-PACKAGE' }),
  parcel({ n: 2, track: 'CANCELLED-PACKAGE', cancelled: true }),
  parcel({ n: 3, track: 'AWAITING-PACKAGE-1' }),
  parcel({ n: 4, track: 'AWAITING-PACKAGE-2' }),
];
const orders = [
  orderSummary({ orderId: 'NO-LABEL-BEFORE', placedAt: '2026-08-05T08:15:00Z' }),
  orderSummary({ orderId: 'AFTER-CUTOFF', placedAt: '2026-08-05T15:30:00Z' }),
];

test.use({
  scenario: healthyScenario({
    authenticated: false,
    remembered: { stationId: 'PACK-01', operatorLabel: 'Warehouse operator' },
    snapshots: [snapshot({ parcels, orders })],
  }),
});

test('captures the exact remembered-login and package-metric states for main-session inspection', async ({ page }) => {
  await mkdir(evidenceDirectory, { recursive: true });
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });

  await page.setViewportSize({ width: 1440, height: 980 });
  await expect(page.locator(selectors.accessGate)).toBeVisible();
  await expect(page.locator('#stationId')).toHaveValue('PACK-01');
  await expect(page.locator('#operatorLabel')).toHaveValue('Warehouse operator');
  await expect(page.locator('#warehousePassword')).toHaveValue('');
  await expect(page.locator('#warehousePassword')).toBeFocused();
  await page.screenshot({ path: screenshots.login, fullPage: true });

  await page.locator('#warehousePassword').fill('warehouse-pass');
  await page.locator('#loginButton').click();
  await waitForReady(page);
  await page.locator('#langSwitch button[data-lang="en"]').click();
  await scan(page, 'ACCEPTED-PACKAGE');
  await expect(page.locator(selectors.feedback)).toHaveAttribute('data-kind', 'success');
  await expect(page.locator('#totalCount')).toHaveText('4');
  await expect(page.locator('#scannedCount')).toHaveText('1');
  await expect(page.locator('#openCount')).toHaveText('3');
  await expect(page.locator('#noLabelCount')).toHaveText('1');
  await expect(page.locator('#tomorrowCount')).toHaveText('1');
  await page.screenshot({ path: screenshots.desktop, fullPage: true });

  await page.setViewportSize({ width: 390, height: 900 });
  await scan(page, 'CANCELLED-PACKAGE');
  await expect(page.locator(selectors.feedback)).toHaveAttribute('data-kind', 'stop');
  await expect(page.locator('#openCount')).toHaveText('2');
  await page.screenshot({ path: screenshots.mobile, fullPage: true });

  const geometry = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(runtimeErrors).toEqual([]);
});

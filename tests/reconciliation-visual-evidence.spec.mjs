import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, selectors, waitForReady } from './fixtures/mock-bol.mjs';
import { healthyScenario, parcel, snapshot } from './fixtures/data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDirectory = path.join(root, 'verification', 'screenshot-evidence');
const desktopPath = path.join(evidenceDirectory, '2026-08-18-daily-label-reconciliation-desktop.png');
const mobilePath = path.join(evidenceDirectory, '2026-08-18-daily-label-reconciliation-mobile.png');
const mobileBottomPath = path.join(evidenceDirectory, '2026-08-18-daily-label-reconciliation-mobile-bottom.png');

const scanned = parcel({ n: 1, track: 'TRACK-SCANNED' });
const cancelled = parcel({ n: 2, track: 'TRACK-CANCELLED', cancelled: true });
const missing = parcel({ n: 3, track: 'TRACK-MISSING' });

test.use({
  scenario: healthyScenario({
    snapshots: [snapshot({ parcels: [scanned, cancelled, missing] })],
    reconciliationRecorded: true,
    records: [{
      trackingCode: 'TRACK-SCANNED', shipmentId: 'SHIPMENT-1', orderId: 'ORDER-1', sourceAccount: 'primary',
      outcome: 'accepted', recordedAt: '2026-08-05T09:30:00.000Z',
    }],
  }),
});

test('captures the exact desktop and mobile reconciliation surfaces for review', async ({ page }) => {
  await mkdir(evidenceDirectory, { recursive: true });
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await waitForReady(page);
  await page.locator(selectors.dailyReportButton).click();
  await expect(page.locator(selectors.reconciliationObserved)).toHaveText('3');
  await expect(page.locator(selectors.reconciliationRows)).toContainText('TRACK-MISSING');
  await page.screenshot({ path: desktopPath });

  await page.locator('#reconciliationCloseButton').click();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator(selectors.dailyReportButton).click();
  await expect(page.locator(selectors.dailyReportDialog)).toBeVisible();
  await page.locator('.reconciliation-panel').evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: mobilePath });
  await expect(page.locator('#reconciliationTitle')).toBeVisible();
  await page.locator('.reconciliation-panel').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.screenshot({ path: mobileBottomPath });
  await expect(page.locator('#reconciliationCloseButton')).toBeVisible();

  const geometry = await page.locator(selectors.dailyReportDialog).evaluate((dialog) => ({
    left: dialog.getBoundingClientRect().left,
    right: dialog.getBoundingClientRect().right,
    viewport: document.documentElement.clientWidth,
  }));
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
  expect(runtimeErrors).toEqual([]);
});

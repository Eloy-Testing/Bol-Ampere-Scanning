import { readFile } from 'node:fs/promises';
import { test, expect, selectors, waitForReady } from './fixtures/mock-bol.mjs';
import { healthyScenario, parcel, snapshot } from './fixtures/data.mjs';

function reconciliationScenario(overrides = {}) {
  const scanned = parcel({ n: 1, track: 'TRACK-SCANNED' });
  const cancelled = parcel({ n: 2, track: 'TRACK-CANCELLED', cancelled: true });
  const missing = parcel({ n: 3, track: 'TRACK-MISSING' });
  return healthyScenario({
    snapshots: [snapshot({ parcels: [scanned, cancelled, missing] })],
    reconciliationRecorded: true,
    records: [{
      trackingCode: 'TRACK-SCANNED',
      shipmentId: 'SHIPMENT-1',
      orderId: 'ORDER-1',
      sourceAccount: 'primary',
      outcome: 'accepted',
      recordedAt: '2026-08-05T09:30:00.000Z',
    }],
    ...overrides,
  });
}

test.use({ scenario: reconciliationScenario() });

test('stored daily report replaces the Excel comparison with exact package-grain totals', async ({ page }) => {
  await waitForReady(page);
  await page.locator(selectors.dailyReportButton).click();
  await expect(page.locator(selectors.dailyReportDialog)).toBeVisible();
  await expect(page.locator(selectors.reconciliationDecision)).toBeFocused();
  await expect(page.locator(selectors.reconciliationObserved)).toHaveText('3');
  await expect(page.locator(selectors.reconciliationCancelled)).toHaveText('1');
  await expect(page.locator(selectors.reconciliationExpected)).toHaveText('2');
  await expect(page.locator(selectors.reconciliationScanned)).toHaveText('1');
  await expect(page.locator(selectors.reconciliationMissing)).toHaveText('1');
  await expect(page.locator(selectors.reconciliationAdjustments)).toHaveText('0');
  await expect(page.locator(selectors.reconciliationRows)).toContainText('TRACK-MISSING');
  await expect(page.locator(selectors.reconciliationRows)).not.toContainText('TRACK-CANCELLED');
  await expect(page.locator('#reconciliationSource')).toContainText('exact label-created event is not available');
  await expect(page.locator(selectors.reconciliationWorkday)).toHaveValue('2026-08-05');

  await page.locator('#reconciliationCloseButton').click();
  await expect(page.locator(selectors.dailyReportDialog)).toBeHidden();
  await expect(page.locator(selectors.dailyReportButton)).toBeFocused();
});

test('failed refresh preserves the last complete stored totals', async ({ page }) => {
  await waitForReady(page);
  await page.locator(selectors.dailyReportButton).click();
  await expect(page.locator(selectors.reconciliationObserved)).toHaveText('3');
  await page.evaluate(() => window.__apiMock.addFailure({ kind: 'reconciliation', status: 503, code: 'source_unavailable', delayMs: 250 }));
  await page.locator(selectors.reconciliationRefresh).click();
  await expect(page.locator(selectors.reconciliationStatus)).toContainText('Checking Bol shipments again');
  await expect(page.locator(selectors.reconciliationRefresh)).toBeDisabled();
  await expect(page.locator(selectors.reconciliationObserved)).toHaveText('3');
  await expect(page.locator(selectors.reconciliationStatus)).toContainText('last stored report remains visible');
  await expect(page.locator(selectors.reconciliationObserved)).toHaveText('3');
  await expect(page.locator(selectors.reconciliationMissing)).toHaveText('1');
});

test.describe('closed workday', () => {
  test.use({ scenario: reconciliationScenario({ reconciliationClosedAt: '2026-08-05T09:00:00.000Z' }) });

  test('shows late facts as adjustments without rewriting the close', async ({ page }) => {
    await waitForReady(page);
    await page.locator(selectors.dailyReportButton).click();
    await expect(page.locator(selectors.reconciliationAdjustments)).toHaveText('3');
    await expect(page.locator('#reconciliationClosed')).toContainText('Closed');
    await expect(page.locator('#reconciliationClosed')).toContainText('Later facts remain visible as adjustments');
  });
});

test('historical reports are view-only and cannot trigger a misleading current refresh', async ({ page }) => {
  await waitForReady(page);
  await page.locator(selectors.dailyReportButton).click();
  await page.locator(selectors.reconciliationWorkday).fill('2026-08-04');
  await page.locator(selectors.reconciliationWorkday).press('Tab');
  await expect(page.locator(selectors.reconciliationRefresh)).toBeDisabled();
  await expect(page.locator(selectors.reconciliationStatus)).toContainText('Historical workdays are read-only');
  const posts = await page.evaluate(() => window.__apiMock.callsOf('reconciliation').filter((call) => call.method === 'POST').length);
  expect(posts).toBe(0);
});

test.describe('first report', () => {
  test.use({ scenario: healthyScenario() });

  test('refresh creates the first stored report and CSV exports the same package rows', async ({ page }) => {
    await waitForReady(page);
    await page.locator(selectors.dailyReportButton).click();
    await expect(page.locator(selectors.reconciliationObserved)).toHaveText('—');
    await page.locator(selectors.reconciliationRefresh).click();
    await expect(page.locator(selectors.reconciliationObserved)).toHaveText('1');
    await expect(page.locator(selectors.reconciliationStatus)).toContainText('Complete report stored');

    const downloadPromise = page.waitForEvent('download');
    await page.locator(selectors.reconciliationDownload).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('ampere-reconciliation-primary-2026-08-05.csv');
    const csv = await readFile(await download.path(), 'utf8');
    expect(csv).toContain('workday,account,tracking,shipments,orders,status');
    expect(csv).toContain('2026-08-05,Bankhoes,TRACK-1,SHIPMENT-1,ORDER-1,missing');
  });
});

test.describe('mobile daily report', () => {
  test.use({ scenario: reconciliationScenario(), viewportSize: { width: 390, height: 844 } });

  test('keeps controls and decision surface within the viewport', async ({ page }) => {
    await waitForReady(page);
    await page.locator(selectors.dailyReportButton).click();
    await expect(page.locator(selectors.dailyReportDialog)).toBeVisible();
    const geometry = await page.locator(selectors.dailyReportDialog).evaluate((dialog) => ({
      left: dialog.getBoundingClientRect().left,
      right: dialog.getBoundingClientRect().right,
      viewport: document.documentElement.clientWidth,
    }));
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
    await expect(page.locator(selectors.reconciliationRefresh)).toBeVisible();
    await expect(page.locator(selectors.reconciliationDecision)).toContainText('TRACK-MISSING');
  });
});

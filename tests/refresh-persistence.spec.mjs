import { test, expect, selectors, waitForReady, scan, acceptedCount } from './fixtures/mock-bol.mjs';
import { healthyScenario, parcel, snapshot } from './fixtures/data.mjs';

test('accepted and STOP records survive refresh within the same Amsterdam workday', async ({ page }) => {
  await waitForReady(page);
  await scan(page, 'TRACK-1');
  await expect.poll(() => acceptedCount(page)).toBe(1);
  await scan(page, 'UNKNOWN-PACKAGE');
  await expect(page.locator(selectors.feedback)).toContainText(/STOP|do not send/i);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  expect(await acceptedCount(page)).toBe(1);
  await expect(page.locator(selectors.stopList)).toContainText('UNKNOWN-PACKAGE');
});

test.describe('Amsterdam 16:00 rollover', () => {
  test.use({
    now: '2026-08-05T13:59:00Z',
    scenario: healthyScenario({ snapshots: [snapshot({ parcels: [
      parcel({ n: 1, track: 'ACCEPTED-BEFORE-CUTOFF' }),
      parcel({ n: 2, track: 'CANCELLED-BEFORE-CUTOFF', cancelled: true }),
    ] })] }),
  });

  test('keeps terminal package decisions through exact cutoff refresh and reload but drops old STOP records', async ({ page }) => {
    await waitForReady(page);
    await scan(page, 'ACCEPTED-BEFORE-CUTOFF');
    await expect.poll(() => acceptedCount(page)).toBe(1);
    await scan(page, 'CANCELLED-BEFORE-CUTOFF');
    await expect(page.locator('#cancelledList')).toContainText('CANCELLED-BEFORE-CUTOFF');
    await scan(page, 'UNKNOWN-BEFORE-CUTOFF');
    await expect(page.locator(selectors.stopList)).toContainText('UNKNOWN-BEFORE-CUTOFF');

    await page.clock.setFixedTime(new Date('2026-08-05T14:00:00Z'));
    await page.evaluate(async () => {
      await window.__apiMock.setWorkday('2026-08-06');
      await window.__scannerTest.refresh();
    });
    await expect(page.locator('#totalCount')).toHaveText('2');
    await expect(page.locator('#scannedCount')).toHaveText('1');
    await expect(page.locator('#openCount')).toHaveText('0');
    await expect(page.locator('#cancelledList')).toContainText('CANCELLED-BEFORE-CUTOFF');
    await expect(page.locator(selectors.stopList)).not.toContainText('UNKNOWN-BEFORE-CUTOFF');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForReady(page);
    await expect(page.locator('#scannedCount')).toHaveText('1');
    await expect(page.locator('#cancelledList')).toContainText('CANCELLED-BEFORE-CUTOFF');
    await expect(page.locator(selectors.stopList)).not.toContainText('UNKNOWN-BEFORE-CUTOFF');

    await scan(page, 'ACCEPTED-BEFORE-CUTOFF');
    await expect(page.locator(selectors.feedback)).toHaveAttribute('data-kind', 'duplicate');
    await expect(page.locator('#scannedCount')).toHaveText('1');
  });
});

test('operational state is never written to browser storage', async ({ page }) => {
  await waitForReady(page);
  await scan(page, 'TRACK-1');
  await expect.poll(() => acceptedCount(page)).toBe(1);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['ampere_language_v2']);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  expect(await acceptedCount(page)).toBe(1);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['ampere_language_v2']);
});

test('a stale snapshot blocks without swallowing the operator scan value', async ({ page }) => {
  await waitForReady(page);
  const input = page.locator(selectors.scanInput);
  await input.fill('TRACK-1');
  await page.clock.setFixedTime(new Date('2026-08-05T10:31:00Z'));
  await input.press('Enter');

  await expect(input).toBeDisabled();
  await expect(input).toHaveValue('TRACK-1');
  expect(await acceptedCount(page)).toBe(0);
});

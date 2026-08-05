import { test, expect, selectors, waitForReady, scan, acceptedCount } from './fixtures/mock-bol.mjs';

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

test('stale accepted state does not count in a new Amsterdam workday', async ({ page }) => {
  await waitForReady(page);
  await scan(page, 'TRACK-1');
  await expect.poll(() => acceptedCount(page)).toBe(1);

  await page.evaluate(() => window.__apiMock.setWorkday('2026-08-07'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForReady(page);
  expect(await acceptedCount(page)).toBe(0);
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

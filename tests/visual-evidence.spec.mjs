import { test, expect, selectors, waitForReady, scan, acceptedCount } from './fixtures/mock-bol.mjs';
import { healthyScenario, orderSummary, parcel, snapshot } from './fixtures/data.mjs';

const parcels = [
  parcel({ n: 1 }), parcel({ n: 2 }), parcel({ n: 3 }), parcel({ n: 4 }), parcel({ n: 5, cancelled: true }),
];
const orders = [
  orderSummary({ orderId: 'OPEN-BEFORE-CUTOFF', placedAt: '2026-08-05T08:15:00Z' }),
  orderSummary({ orderId: 'OPEN-AFTER-CUTOFF', placedAt: '2026-08-05T15:30:00Z', ean: '8710000000042' }),
];

test.use({ scenario: healthyScenario({ snapshots: [snapshot({ parcels, orders })] }) });

test('renders clean desktop and mobile operational states for main-session inspection', async ({ page }, testInfo) => {
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });

  await page.setViewportSize({ width: 1440, height: 980 });
  await waitForReady(page);
  await scan(page, 'TRACK-1');
  await expect.poll(() => acceptedCount(page)).toBe(1);
  await expect(page.locator(selectors.feedback)).toContainText(/GO|cleared/i);
  await page.screenshot({
    path: testInfo.outputPath('standalone-scanner-desktop.png'),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 900 });
  await scan(page, 'TRACK-5');
  await expect(page.locator(selectors.feedback)).toContainText(/STOP|cancel/i);
  await page.screenshot({
    path: testInfo.outputPath('standalone-scanner-mobile.png'),
    fullPage: true,
  });

  expect(runtimeErrors).toEqual([]);
});

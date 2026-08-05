import { test, expect, waitForReady } from './fixtures/mock-bol.mjs';
import { healthyScenario, orderSummary, paginatedRecords, parcel, snapshot } from './fixtures/data.mjs';

test.describe('pagination', () => {
  const orders = paginatedRecords('orders', 51, (n) => orderSummary({ orderId: `ORDER-PAGE-${n}` }));
  const parcels = paginatedRecords('shipments', 51, (n) => parcel({ n, orderId: `SHIP-ORDER-${n}`, track: `PAGE-TRACK-${n}` }));
  test.use({ scenario: healthyScenario({ snapshots: [snapshot({ orders, parcels, pageSize: 50 })] }) });

  test('loads every orders and shipments page before enabling scanning', async ({ page }) => {
    await waitForReady(page);
    const calls = await page.evaluate(() => ({
      orders: window.__apiMock.callsOf('orders').map((call) => call.page),
      shipments: window.__apiMock.callsOf('shipments').map((call) => call.page),
    }));
    expect(calls.orders).toEqual(expect.arrayContaining([1, 2]));
    expect(calls.shipments).toEqual(expect.arrayContaining([1, 2]));
    await expect(page.locator('[data-track-code="PAGE-TRACK-51"]')).toBeAttached();
    await expect(page.locator('[data-order-id="ORDER-PAGE-51"]')).toBeAttached();
  });
});

test('Amsterdam cutoff hook handles summer, winter, and both DST transition days', async ({ page }) => {
  const cases = [
    ['2026-07-10T12:00:00Z', '2026-07-10T14:00:00.000Z', '2026-07-09T14:00:00.000Z'],
    ['2026-01-10T12:00:00Z', '2026-01-10T15:00:00.000Z', '2026-01-09T15:00:00.000Z'],
    ['2026-03-29T12:00:00Z', '2026-03-29T14:00:00.000Z', '2026-03-28T15:00:00.000Z'],
    ['2026-10-25T12:00:00Z', '2026-10-25T15:00:00.000Z', '2026-10-24T14:00:00.000Z'],
  ];
  const actual = await page.evaluate((inputs) => inputs.map(([instant]) => window.__scannerTest.amsterdamWindow(instant)), cases);
  for (let index = 0; index < cases.length; index += 1) {
    expect(actual[index].todayCutoffIso).toBe(cases[index][1]);
    expect(actual[index].previousCutoffIso).toBe(cases[index][2]);
  }
});

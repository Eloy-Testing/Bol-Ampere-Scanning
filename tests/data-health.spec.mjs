import { test, expect, selectors, waitForReady, waitForSignedOut, signIn } from './fixtures/mock-bol.mjs';
import { healthyScenario, orderSummary, parcel, snapshot } from './fixtures/data.mjs';

for (const failure of [
  { name: 'orders list', scenario: healthyScenario({ failures: [{ kind: 'orders', page: 1 }] }) },
  { name: 'shipments list', scenario: healthyScenario({ failures: [{ kind: 'shipments', page: 1 }] }) },
  {
    name: 'order detail',
    scenario: healthyScenario({
      snapshots: [snapshot({ orders: [orderSummary({ orderId: 'OPEN-ORDER-1' })], parcels: [parcel()] })],
      failures: [{ kind: 'orderDetail', identifier: 'OPEN-ORDER-1' }],
    }),
  },
  { name: 'shipment detail', scenario: healthyScenario({ failures: [{ kind: 'shipmentDetail', identifier: 'SHIPMENT-1' }] }) },
]) {
  test.describe(failure.name, () => {
    test.use({ scenario: failure.scenario });

    test('initial incompleteness disables scanning and offers retry', async ({ page }) => {
      await expect(page.locator(selectors.scanInput)).toBeDisabled();
      await expect(page.locator(selectors.dataStatus)).toHaveAttribute('data-state', 'error');
      await expect(page.locator(selectors.retryData)).toBeVisible();
    });
  });
}

test.describe('pending initial snapshot', () => {
  test.use({ scenario: healthyScenario({ delays: { shipments: 250 } }) });

  test('input remains disabled until the complete snapshot commits atomically', async ({ page }) => {
    const input = page.locator(selectors.scanInput);
    await expect(input).toBeDisabled();
    await expect(page.locator(selectors.dataStatus)).toHaveAttribute('data-state', 'loading');
    await waitForReady(page);
  });
});

test.describe('session gate', () => {
  test.use({ scenario: healthyScenario({ authenticated: false }) });

  test('requires constrained station credentials and opens the scanner after sign-in', async ({ page }) => {
    await waitForSignedOut(page);
    await expect(page.locator(selectors.operationalSurface)).toBeHidden();
    await signIn(page);
    await waitForReady(page);
    await expect(page.locator('#sessionLabel')).toContainText('PACK-01');
  });

  test('keeps the gate closed after invalid credentials', async ({ page }) => {
    await waitForSignedOut(page);
    await signIn(page, { password: 'not-the-password' });
    await expect(page.locator(selectors.authStatus)).toContainText(/not accepted/i);
    await expect(page.locator(selectors.operationalSurface)).toBeHidden();
    await expect(page.locator('#warehousePassword')).toBeFocused();
  });
});

test('session expiry clears operational state and returns focus to the gate', async ({ page }) => {
  await waitForReady(page);
  await page.evaluate(() => window.__apiMock.expireSession());
  await page.locator(selectors.refreshData).click();
  await expect(page.locator(selectors.accessGate)).toBeVisible();
  await expect(page.locator(selectors.authStatus)).toContainText(/expired/i);
  await expect(page.locator(selectors.operationalSurface)).toBeHidden();
  await expect(page.locator('#stationId')).toBeFocused();
});

test.describe('session expiry during scanner input', () => {
  test.use({ scenario: healthyScenario({ session: { expiresAt: '2026-08-05T10:00:01.000Z' } }) });

  test('preserves the code and sends no scan after access expires', async ({ page }) => {
    await waitForReady(page);
    await page.locator(selectors.scanInput).fill('TRACK-1');
    await page.clock.fastForward(2_000);
    await page.locator(selectors.scanInput).press('Enter');
    await expect(page.locator(selectors.accessGate)).toBeVisible();
    await expect(page.locator(selectors.authStatus)).toContainText(/expired/i);
    await expect(page.locator(selectors.scanInput)).toHaveValue('TRACK-1');
    expect(await page.evaluate(() => window.__apiMock.callsOf('scan'))).toHaveLength(0);
  });
});

test.describe('shared state failure', () => {
  test.use({ scenario: healthyScenario({ failures: [{ kind: 'state', code: 'database_unavailable' }] }) });

  test('fails closed with an actionable shared-state message', async ({ page }) => {
    await expect(page.locator(selectors.scanInput)).toBeDisabled();
    await expect(page.locator(selectors.dataStatus)).toHaveAttribute('data-state', 'error');
    await expect(page.locator(selectors.dataStatus)).toContainText(/shared station state is unavailable/i);
    await expect(page.locator(selectors.retryData)).toBeVisible();
  });
});

test('logout hides retailer data and returns to the station gate', async ({ page }) => {
  await waitForReady(page);
  await page.locator('#logoutButton').click();
  await waitForSignedOut(page);
  await expect(page.locator(selectors.operationalSurface)).toBeHidden();
});

test.describe('logout failure', () => {
  test.use({ scenario: healthyScenario({ failures: [{ kind: 'logout', networkError: true }] }) });

  test('locks the station and reports that revocation was not confirmed', async ({ page }) => {
    await waitForReady(page);
    await page.locator('#logoutButton').click();
    await expect(page.locator(selectors.accessGate)).toBeVisible();
    await expect(page.locator(selectors.authStatus)).toContainText(/could not be confirmed/i);
    await expect(page.locator(selectors.operationalSurface)).toBeHidden();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator(selectors.authStatus)).toContainText(/could not be confirmed/i);
    await page.evaluate(() => window.__apiMock.clearFailures());
    await page.locator('[data-testid="retry-logout"]').click();
    await waitForSignedOut(page);
  });
});

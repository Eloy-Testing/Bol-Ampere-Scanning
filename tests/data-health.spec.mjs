import { test, expect, selectors, waitForReady, waitForSignedOut, signIn, scan } from './fixtures/mock-bol.mjs';
import { healthyScenario, orderSummary, parcel, snapshot } from './fixtures/data.mjs';

const mismatchedParcel = parcel({ n: 88, shippedAt: '2026-08-05T09:00:00Z' });
mismatchedParcel.detail.shipmentDateTime = '2026-08-05T09:00:01Z';
const invalidPlacedAtParcel = parcel({ n: 89, shippedAt: '2026-08-05T09:00:00Z' });
invalidPlacedAtParcel.detail.order.orderPlacedDateTime = 'not-a-date';
const impossiblePlacedAtParcel = parcel({ n: 90, shippedAt: '2026-08-05T09:00:00Z' });
impossiblePlacedAtParcel.detail.order.orderPlacedDateTime = '2026-02-30T10:00:00Z';
const impossibleShipmentListParcel = parcel({ n: 91, shippedAt: '2026-08-05T09:00:00Z' });
impossibleShipmentListParcel.summary.shipmentDateTime = '2026-02-30T10:00:00Z';

function dualAccountSnapshot(primary, secondary) {
  return { accounts: { primary, secondary } };
}

for (const failure of [
  { name: 'orders list', scenario: healthyScenario({ failures: [{ kind: 'orders', page: 1 }] }) },
  { name: 'shipments list', scenario: healthyScenario({ failures: [{ kind: 'shipments', page: 1 }] }) },
  {
    name: 'order summary',
    scenario: healthyScenario({
      snapshots: [snapshot({ orders: [{ orderId: 'OPEN-ORDER-1', orderPlacedDateTime: '2026-08-05T08:00:00Z' }], parcels: [parcel()] })],
    }),
  },
  { name: 'shipment detail', scenario: healthyScenario({ failures: [{ kind: 'shipmentDetail', identifier: 'SHIPMENT-1' }] }) },
  { name: 'shipment list/detail mismatch', scenario: healthyScenario({ snapshots: [snapshot({ parcels: [mismatchedParcel] })] }) },
  { name: 'shipment detail order timestamp', scenario: healthyScenario({ snapshots: [snapshot({ parcels: [invalidPlacedAtParcel] })] }) },
  { name: 'shipment detail impossible calendar timestamp', scenario: healthyScenario({ snapshots: [snapshot({ parcels: [impossiblePlacedAtParcel] })] }) },
  { name: 'shipment list impossible calendar timestamp', scenario: healthyScenario({ snapshots: [snapshot({ parcels: [impossibleShipmentListParcel] })] }) },
]) {
  test.describe(failure.name, () => {
    test.use({ scenario: failure.scenario });

    test('initial incompleteness disables scanning and offers retry', async ({ page }) => {
      await expect(page.locator(selectors.scanInput)).toBeDisabled();
      await expect(page.locator(selectors.dataStatus)).toHaveAttribute('data-state', 'error');
      await expect(page.locator(selectors.retryData)).toBeVisible();
      await expect(page.locator('#scanTitle')).toHaveText('Scanning paused');
      await expect(page.locator('#scanHint')).toContainText(/retry before scanning/i);
      await expect(page.locator('#readyFlag')).toHaveText('WAIT');
      await expect(page.locator(selectors.feedback)).toHaveAttribute('data-kind', 'paused');
      await expect(page.locator(selectors.feedback)).toContainText(/shipment data is incomplete/i);
    });
  });
}

test.describe('translated paused-state recovery', () => {
  test.use({ scenario: healthyScenario({ failures: [{ kind: 'shipments', page: 1 }] }) });

  test('keeps each supported language truthful while blocked and restores ready state only after retry succeeds', async ({ page }) => {
    const states = [
      ['nl', 'Scannen gepauzeerd', /verzenddata is niet compleet/i],
      ['en', 'Scanning paused', /shipment data is incomplete/i],
      ['es', 'Escaneo pausado', /datos de envíos están incompletos/i],
    ];
    for (const [language, title, decision] of states) {
      await page.locator(`#langSwitch button[data-lang="${language}"]`).click();
      await expect(page.locator('#scanTitle')).toHaveText(title);
      await expect(page.locator(selectors.feedback)).toContainText(decision);
      await expect(page.locator(selectors.scanInput)).toBeDisabled();
    }
    await page.locator('#langSwitch button[data-lang="en"]').click();
    await page.evaluate(() => window.__apiMock.clearFailures());
    await page.locator(selectors.retryData).click();
    await waitForReady(page);
    await expect(page.locator('#scanTitle')).toHaveText('Ready for scanner');
    await expect(page.locator(selectors.feedback)).toHaveAttribute('data-kind', 'idle');
    await expect(page.locator(selectors.feedback)).toContainText(/no parcel scanned yet/i);
  });
});

test('keeps the last real package decision visible when a stale snapshot refresh is paused', async ({ page }) => {
  await waitForReady(page);
  await scan(page, 'TRACK-1');
  await expect(page.locator(selectors.feedback)).toHaveAttribute('data-kind', 'success');
  await page.evaluate(() => window.__apiMock.addFailure({ kind: 'shipments', page: 1 }));
  await page.clock.setFixedTime(new Date('2026-08-05T10:31:00Z'));
  await page.locator(selectors.refreshData).click();
  await expect(page.locator(selectors.dataStatus)).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#scanTitle')).toHaveText('Scanning paused');
  await expect(page.locator(selectors.scanInput)).toBeDisabled();
  await expect(page.locator(selectors.feedback)).toHaveAttribute('data-kind', 'success');
  await expect(page.locator(selectors.feedback)).toContainText(/ORDER-1 cleared/i);
});

test.describe('pending initial snapshot', () => {
  test.use({ scenario: healthyScenario({ delays: { shipments: 250 } }) });

  test('input remains disabled until the complete snapshot commits atomically', async ({ page }) => {
    const input = page.locator(selectors.scanInput);
    await expect(input).toBeDisabled();
    await expect(page.locator(selectors.dataStatus)).toHaveAttribute('data-state', 'loading');
    await waitForReady(page);
  });
});

test.describe('dual Bol account snapshot', () => {
  const primary = snapshot({ parcels: [parcel({ n: 1, track: 'PRIMARY-TRACK' })] });
  const secondary = snapshot({ parcels: [parcel({ n: 2, track: 'SECONDARY-TRACK' })] });
  test.use({ scenario: healthyScenario({ snapshots: [dualAccountSnapshot(primary, secondary)] }) });

  test('keeps each account on its own tab and sends the selected source key with a client scan', async ({ page }) => {
    await waitForReady(page);
    const staticDocument = await page.request.get('/index.html');
    await expect(staticDocument).toBeOK();
    await expect(await staticDocument.text()).toContain('data-testid="account-tab-secondary" data-account="secondary" role="tab" type="button" aria-selected="false">Muisstil</button>');
    await expect(page.locator(selectors.accountTabs)).toBeVisible();
    await expect(page.locator(selectors.primaryAccountTab)).toHaveAttribute('aria-selected', 'true');
    for (const language of ['nl', 'en', 'es']) {
      await page.locator(`#langSwitch button[data-lang="${language}"]`).click();
      await expect(page.locator(selectors.secondaryAccountTab)).toHaveText('Muisstil');
    }
    await expect(page.locator(selectors.shipmentList)).toContainText('PRIMARY-TRACK');
    await expect(page.locator(selectors.shipmentList)).not.toContainText('SECONDARY-TRACK');
    await page.locator(selectors.secondaryAccountTab).click();
    await expect(page.locator(selectors.secondaryAccountTab)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(selectors.shipmentList)).toContainText('SECONDARY-TRACK');
    await expect(page.locator(selectors.shipmentList)).not.toContainText('PRIMARY-TRACK');
    await expect(page.locator(selectors.scanInput)).toBeFocused();
    await page.locator(selectors.scanInput).fill('SECONDARY-TRACK');
    await page.locator(selectors.scanInput).press('Enter');
    await expect.poll(() => page.evaluate(() => window.__apiMock.callsOf('scan').at(-1)?.body?.account)).toBe('secondary');
    await expect(page.locator(selectors.scannedCount)).toHaveText('1');
    await page.locator(selectors.primaryAccountTab).click();
    await expect(page.locator(selectors.scannedCount)).toHaveText('0');
    await expect(page.locator(selectors.shipmentList)).toContainText('PRIMARY-TRACK');
    await expect(page.locator(selectors.shipmentList)).not.toContainText('SECONDARY-TRACK');
  });

});

test.describe('account switch during live verification', () => {
  const primary = snapshot({ parcels: [parcel({ n: 1, track: 'PRIMARY-TRACK' })] });
  const secondary = snapshot({ parcels: [parcel({ n: 2, track: 'SECONDARY-TRACK', verifierDelayMs: 200 })] });
  test.use({ scenario: healthyScenario({ snapshots: [dualAccountSnapshot(primary, secondary)] }) });

  test('locks account selection until the source-bound decision completes', async ({ page }) => {
    await waitForReady(page);
    await page.locator(selectors.secondaryAccountTab).click();
    await page.locator(selectors.scanInput).fill('SECONDARY-TRACK');
    await page.locator(selectors.scanInput).press('Enter');
    await expect(page.locator(selectors.primaryAccountTab)).toBeDisabled();
    await expect.poll(() => page.evaluate(() => window.__apiMock.callsOf('scan').length)).toBe(1);
    await expect(page.locator(selectors.primaryAccountTab)).toBeEnabled();
  });
});

test('keeps the primary scanner unchanged when no client source is configured', async ({ page }) => {
  await waitForReady(page);
  await expect(page.locator(selectors.accountTabs)).toBeHidden();
  await expect(page.locator(selectors.shipmentList)).toContainText('TRACK-1');
});

test.describe('secondary account incompleteness', () => {
  const primary = snapshot({ parcels: [parcel({ n: 1, track: 'PRIMARY-TRACK' })] });
  const secondary = snapshot({ parcels: [parcel({ n: 2, track: 'SECONDARY-TRACK' })] });
  test.use({ scenario: healthyScenario({
    snapshots: [dualAccountSnapshot(primary, secondary)],
    failures: [{ kind: 'orders', account: 'secondary', page: 1 }],
  }) });

  test('fails closed before scanning when the secondary account is incomplete', async ({ page }) => {
    await expect(page.locator(selectors.scanInput)).toBeDisabled();
    await expect(page.locator(selectors.dataStatus)).toHaveAttribute('data-state', 'error');
  });
});

test.describe('cross-account tracking collision', () => {
  const primary = snapshot({ parcels: [parcel({ n: 1, track: 'DUPLICATE-TRACK' })] });
  const secondary = snapshot({ parcels: [parcel({ n: 2, track: 'DUPLICATE-TRACK' })] });
  test.use({ scenario: healthyScenario({ snapshots: [dualAccountSnapshot(primary, secondary)] }) });

  test('keeps the global fail-closed collision guard when the same tracking code appears across accounts', async ({ page }) => {
    await expect(page.locator(selectors.scanInput)).toBeDisabled();
    await expect(page.locator(selectors.dataStatus)).toHaveAttribute('data-state', 'error');
  });
});

test.describe('bounded detail failure cleanup', () => {
  const parcels = Array.from({ length: 8 }, (_, index) => parcel({ n: index + 1 }));
  test.use({ scenario: healthyScenario({
    snapshots: [snapshot({ parcels })],
    delays: { shipmentDetail: 150 },
    failures: [{ kind: 'shipmentDetail', identifier: 'SHIPMENT-1', delayMs: 50 }],
  }) });

  test('settles the active worker batch before allowing retry', async ({ page }) => {
    await expect(page.locator(selectors.dataStatus)).toHaveAttribute('data-state', 'error');
    expect(await page.evaluate(() => window.__apiMock.callsOf('shipmentDetail').length)).toBe(4);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__apiMock.callsOf('shipmentDetail').length)).toBe(4);
    await page.evaluate(() => window.__apiMock.clearFailures());
    await page.locator(selectors.retryData).click();
    await waitForReady(page);
    expect(await page.evaluate(() => window.__apiMock.callsOf('shipmentDetail').length)).toBe(12);
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

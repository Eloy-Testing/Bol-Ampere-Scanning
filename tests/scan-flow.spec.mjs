import { test, expect, selectors, waitForReady, signIn, scan, acceptedCount, scanCalls } from './fixtures/mock-bol.mjs';
import { healthyScenario, parcel, snapshot } from './fixtures/data.mjs';

test.describe('rapid scanner queue', () => {
  const parcels = [
    parcel({ n: 1, verifierDelayMs: 180 }),
    parcel({ n: 2, verifierDelayMs: 5 }),
    parcel({ n: 3, verifierDelayMs: 5 }),
  ];
  test.use({ scenario: healthyScenario({ snapshots: [snapshot({ parcels })] }) });

  test('clears input immediately and verifies a burst once in FIFO order', async ({ page }) => {
    await waitForReady(page);
    for (const entry of parcels) {
      await scan(page, entry.detail.transport.trackAndTrace);
      await expect(page.locator(selectors.scanInput)).toHaveValue('');
    }

    await expect.poll(() => acceptedCount(page)).toBe(3);
    expect(await scanCalls(page)).toEqual(['TRACK-1', 'TRACK-2', 'TRACK-3']);
    expect(await page.evaluate(() => window.__apiMock.maxConcurrentScans)).toBe(1);
    await expect(page.locator(selectors.scanInput)).toBeFocused();
  });

  test('suppresses a duplicate while its first scan is still in flight', async ({ page }) => {
    await waitForReady(page);
    await scan(page, 'TRACK-1');
    await scan(page, 'track-1');

    await expect.poll(() => acceptedCount(page)).toBe(1);
    expect((await scanCalls(page)).filter((code) => code === 'TRACK-1')).toHaveLength(1);
    await expect(page.locator(selectors.feedback)).toContainText(/already scanned|duplicate|no change/i);
    await expect(page.locator(selectors.scanInput)).toBeFocused();
  });
});

test.describe('terminal decisions', () => {
  const parcels = [parcel({ n: 1 }), parcel({ n: 2, cancelled: true })];
  test.use({ scenario: healthyScenario({ snapshots: [snapshot({ parcels })] }) });

  test('success, duplicate, and cancelled STOP all recover input focus', async ({ page }) => {
    await waitForReady(page);
    await scan(page, 'TRACK-1');
    await expect.poll(() => acceptedCount(page)).toBe(1);
    await expect(page.locator(selectors.feedback)).toContainText(/GO|cleared/i);
    await expect(page.locator(selectors.scanInput)).toBeFocused();

    await scan(page, 'TRACK-1');
    await expect(page.locator(selectors.feedback)).toContainText(/already|duplicate/i);
    await expect(page.locator(selectors.scanInput)).toBeFocused();

    await scan(page, 'TRACK-2');
    await expect(page.locator(selectors.feedback)).toContainText(/STOP|do not send/i);
    expect(await acceptedCount(page)).toBe(1);
    await expect(page.locator(selectors.scanInput)).toBeFocused();
    await expect(page.locator(selectors.shipmentList).locator('[data-track-code="TRACK-2"]')).toContainText(/STOP|cancel/i);
  });
});

test.describe('live verifier failure', () => {
  test.use({
    scenario: healthyScenario({ snapshots: [snapshot({ parcels: [parcel({ verifierDelayMs: 10 })] })] }),
  });

  test('fails closed without recording completion', async ({ page }) => {
    await waitForReady(page);
    await page.evaluate(() => window.__apiMock.setVerifierFailure('ORDER-1'));
    await scan(page, 'TRACK-1');
    await expect(page.locator(selectors.feedback)).toContainText(/STOP|could not verify|do not send/i);
    expect(await acceptedCount(page)).toBe(0);
    await expect(page.locator(selectors.scanInput)).toBeFocused();
  });
});

test.describe('queued shared-state failure', () => {
  const parcels = [parcel({ n: 1 }), parcel({ n: 2 })];
  test.use({ scenario: healthyScenario({
    snapshots: [snapshot({ parcels })],
    failures: [{ kind: 'scan', trackingCode: 'TRACK-1', code: 'database_unavailable', delayMs: 150 }],
  }) });

  test('pauses remaining FIFO work until a healthy retry', async ({ page }) => {
    await waitForReady(page);
    await scan(page, 'TRACK-1');
    await scan(page, 'TRACK-2');
    await expect(page.locator(selectors.scanInput)).toBeDisabled();
    expect(await scanCalls(page)).toEqual(['TRACK-1']);
    await page.evaluate(() => window.__apiMock.clearFailures());
    await page.locator(selectors.retryData).click();
    await expect.poll(() => acceptedCount(page)).toBe(1);
    expect(await scanCalls(page)).toEqual(['TRACK-1', 'TRACK-2']);
  });
});

test.describe('session expiry during a rapid burst', () => {
  const parcels = [parcel({ n: 1 }), parcel({ n: 2 })];
  test.use({ scenario: healthyScenario({
    snapshots: [snapshot({ parcels })],
    failures: [{ kind: 'scan', trackingCode: 'TRACK-1', code: 'session_expired', status: 401, delayMs: 150 }],
  }) });

  test('retains and resumes every unprocessed scan after reauthentication', async ({ page }) => {
    await waitForReady(page);
    await scan(page, 'TRACK-1');
    await scan(page, 'TRACK-2');
    await expect(page.locator(selectors.accessGate)).toBeVisible();
    await expect(page.locator(selectors.authStatus)).toContainText(/2 scans are paused/i);
    await page.evaluate(async () => {
      await window.__apiMock.clearFailures();
      await window.__apiMock.addFailure({ kind: 'state', code: 'database_unavailable' });
    });
    await signIn(page);
    await expect(page.locator(selectors.dataStatus)).toHaveAttribute('data-state', 'error');
    expect(await page.evaluate(() => window.__scannerTest.getState().pausedQueueDepth)).toBe(2);
    await page.evaluate(() => window.__apiMock.clearFailures());
    await page.locator(selectors.retryData).click();
    await expect.poll(() => acceptedCount(page)).toBe(2);
    expect(await scanCalls(page)).toEqual(['TRACK-1', 'TRACK-1', 'TRACK-2']);
  });
});

test.describe('session expiry during an unknown refresh', () => {
  const knownParcel = parcel({ n: 2 });
  test.use({ scenario: healthyScenario({
    snapshots: [snapshot({ parcels: [knownParcel] })],
    failures: [{ kind: 'shipments', page: 1, fromCall: 2, code: 'session_expired', status: 401, delayMs: 150 }],
  }) });

  test('retains the unknown active scan and following burst through reauthentication', async ({ page }) => {
    await waitForReady(page);
    await scan(page, 'UNKNOWN-CODE');
    await scan(page, 'TRACK-2');
    await expect(page.locator(selectors.accessGate)).toBeVisible();
    await expect(page.locator(selectors.authStatus)).toContainText(/2 scans are paused/i);
    await page.evaluate(() => window.__apiMock.clearFailures());
    await signIn(page);
    await expect.poll(() => acceptedCount(page)).toBe(1);
    expect(await scanCalls(page)).toEqual(['UNKNOWN-CODE', 'TRACK-2']);
    await expect(page.locator(selectors.stopList).locator('[data-track-code="UNKNOWN-CODE"]')).toContainText(/unknown/i);
  });
});

test.describe('item-level cancellation scope', () => {
  const scopedParcel = parcel({
    n: 7,
    verifierItems: [
      { orderItemId: 'ORDER-7-ITEM-1', ean: '8710000000001', cancellationRequested: false, quantityCancelled: 0 },
      { orderItemId: 'UNRELATED-ITEM', ean: '8710000000999', cancellationRequested: true, quantityCancelled: 1 },
    ],
  });
  test.use({ scenario: healthyScenario({ snapshots: [snapshot({ parcels: [scopedParcel] })] }) });

  test('does not stop a parcel because an unrelated order item was cancelled', async ({ page }) => {
    await waitForReady(page);
    await scan(page, 'TRACK-7');
    await expect.poll(() => acceptedCount(page)).toBe(1);
    await expect(page.locator(selectors.feedback)).toContainText(/GO|cleared/i);
  });
});

test.describe('unknown rematch refresh', () => {
  const laterParcel = parcel({ n: 9, track: 'LATE-TRACK' });
  test.use({
    scenario: healthyScenario({
      snapshots: [snapshot(), snapshot({ parcels: [laterParcel] })],
    }),
  });

  test('refreshes once and rematches an initially unknown code', async ({ page }) => {
    await waitForReady(page);
    await page.evaluate(() => window.__apiMock.setSnapshot(1));
    await scan(page, 'LATE-TRACK');
    await expect.poll(() => acceptedCount(page)).toBe(1);
    await expect(page.locator(selectors.feedback)).toContainText(/GO|cleared/i);
    expect((await scanCalls(page)).filter((code) => code === 'LATE-TRACK')).toHaveLength(1);
  });

  test('turns refresh failure into an unverified STOP', async ({ page }) => {
    await waitForReady(page);
    await page.evaluate(async () => {
      await window.__apiMock.setSnapshot(1);
      await window.__apiMock.addFailure({ kind: 'shipments', page: 1 });
    });
    await scan(page, 'LATE-TRACK');
    await expect(page.locator(selectors.feedback)).toContainText(/STOP|could not verify|do not send/i);
    expect(await acceptedCount(page)).toBe(0);
    expect(await page.evaluate(() => window.__apiMock.callsOf('scan').at(-1).body.verificationIncomplete)).toBe(true);
    await expect(page.locator(selectors.scanInput)).toBeFocused();
  });
});

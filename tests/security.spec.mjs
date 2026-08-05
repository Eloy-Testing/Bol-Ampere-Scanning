import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect, selectors, waitForReady, scan } from './fixtures/mock-bol.mjs';
import { healthyScenario, parcel, snapshot } from './fixtures/data.mjs';

const attack = '<img src=x onerror="window.__scannerXss=(window.__scannerXss||0)+1">';

test.use({
  scenario: healthyScenario({
    snapshots: [snapshot({ parcels: [parcel({ orderId: attack, track: attack })] })],
  }),
});

test('API and scanner values render inertly', async ({ page }) => {
  await waitForReady(page);
  await expect(page.locator(selectors.shipmentList)).toContainText(attack);
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__scannerXss)).toBeUndefined();

  await scan(page, '<svg onload="window.__scannerXss=2">');
  await expect(page.locator(selectors.feedback)).toContainText('STOP', { ignoreCase: true });
  const unknownBody = await page.evaluate(() => window.__apiMock.callsOf('scan').at(-1)?.body);
  expect(unknownBody.trackingCode).toContain('<SVG');
  expect(unknownBody).not.toHaveProperty('shipmentId');
  expect(await page.evaluate(() => window.__scannerXss)).toBeUndefined();
  await expect(page.locator('svg')).toHaveCount(0);
});

test('the deterministic harness makes no live external requests', async ({ page }) => {
  await waitForReady(page);
  expect(page.externalRequests).toEqual([]);
});

test('the browser bundle contains no server credential names or bearer token handling', async () => {
  const html = await readFile(resolve('index.html'), 'utf8');
  for (const secretName of ['TURSO_AUTH_TOKEN', 'BOL_CLIENT_SECRET', 'WAREHOUSE_PASSWORD_HASH', 'SESSION_SECRET']) {
    expect(html).not.toContain(secretName);
  }
  expect(html).not.toMatch(/authorization\s*:\s*[`'\"]?bearer/i);
});

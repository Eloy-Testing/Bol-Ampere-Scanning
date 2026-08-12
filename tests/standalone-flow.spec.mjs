import { test, expect } from '@playwright/test';

test('actual handlers persist an authoritative scan across reload and stations', async ({ page, browser }) => {
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testid="access-form"]')).toBeVisible();
  await expect(page.locator('#stationId')).toBeFocused();

  await page.locator('#stationId').fill('PACK-REAL-01');
  await page.locator('#operatorLabel').fill('Handler test operator');
  await page.locator('#warehousePassword').fill('warehouse password fixture');
  await page.locator('#loginButton').click();

  const scanInput = page.locator('#scanInput');
  await expect(scanInput).toBeEnabled();
  await expect(scanInput).toBeFocused();

  await page.locator('[data-testid="connections-button"]').click();
  await expect(page.locator('[data-testid="integration-list"]')).toContainText('Bankhoes');
  await page.locator('[data-testid="add-account-button"]').click();
  await page.locator('#accountName').fill('Standalone Client');
  await page.locator('#bolClientId').fill('empty-client');
  await page.locator('#bolClientSecret').fill('standalone-client-secret');
  await page.locator('#integrationPassword').fill('warehouse password fixture');
  await page.locator('#integrationSaveButton').click();
  await expect(page.locator('[data-testid="integration-overview-status"]')).toHaveAttribute('data-tone', 'success');
  await expect(page.locator('[data-testid^="account-tab-acct_"]')).toHaveText('Standalone Client');
  await expect(page.locator('#bolClientSecret')).toHaveValue('');
  await expect(page.locator('#integrationPassword')).toHaveValue('');
  await page.locator('#integrationCloseButton').click();
  await expect(scanInput).toBeFocused();

  await scanInput.fill('TRACK-REAL-1');
  await scanInput.press('Enter');
  await expect(page.locator('[data-testid="scan-feedback"]')).toHaveAttribute('data-kind', 'success');
  await expect(page.locator('[data-testid="scanned-count"]')).toContainText('1');

  const firstState = await page.evaluate(async () => (await fetch('/api/state')).json());
  expect(firstState.scanned['TRACK-REAL-1']).toBeTruthy();
  expect(firstState.records).toHaveLength(1);
  expect(firstState.records[0].outcome).toBe('accepted');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(scanInput).toBeEnabled();
  await expect(page.locator('[data-testid="scanned-count"]')).toContainText('1');
  await scanInput.fill('TRACK-REAL-1');
  await scanInput.press('Enter');
  await expect(page.locator('[data-testid="scan-feedback"]')).toHaveAttribute('data-kind', 'duplicate');
  await expect(page.locator('[data-testid="scanned-count"]')).toContainText('1');

  const secondContext = await browser.newContext();
  const secondStation = await secondContext.newPage();
  await secondStation.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await secondStation.locator('#stationId').fill('PACK-REAL-02');
  await secondStation.locator('#operatorLabel').fill('Second station operator');
  await secondStation.locator('#warehousePassword').fill('warehouse password fixture');
  await secondStation.locator('#loginButton').click();
  const secondInput = secondStation.locator('#scanInput');
  await expect(secondInput).toBeEnabled();
  await expect(secondStation.locator('[data-testid="scanned-count"]')).toContainText('1');
  await secondInput.fill('TRACK-REAL-1');
  await secondInput.press('Enter');
  await expect(secondStation.locator('[data-testid="scan-feedback"]')).toHaveAttribute('data-kind', 'duplicate');
  await expect(secondStation.locator('[data-testid="scanned-count"]')).toContainText('1');
  await secondContext.close();
  expect(consoleErrors).toEqual([]);
});

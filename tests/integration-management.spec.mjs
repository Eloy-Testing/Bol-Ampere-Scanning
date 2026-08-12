import { test, expect, selectors, waitForReady } from './fixtures/mock-bol.mjs';

async function openConnections(page) {
  await waitForReady(page);
  await page.locator(selectors.connectionsButton).click();
  await expect(page.locator(selectors.integrationDialog)).toBeVisible();
  await expect(page.locator(selectors.addAccountButton)).toBeEnabled();
}

async function fillConnection(page, {
  name = 'Client North',
  clientId = 'north-client',
  clientSecret = 'north-secret-value',
  password = 'warehouse-pass',
} = {}) {
  if (await page.locator('#accountNameField').isVisible()) {
    await expect(page.locator('#accountName')).toBeFocused();
    await page.locator('#accountName').fill(name);
  } else {
    await expect(page.locator('#bolClientId')).toBeFocused();
  }
  await page.locator('#bolClientId').fill(clientId);
  await page.locator('#bolClientSecret').fill(clientSecret);
  await page.locator('#integrationPassword').fill(password);
}

test('new Bol connection becomes a separate scanner tab and submitted secrets are cleared', async ({ page }) => {
  await openConnections(page);
  await expect(page.locator(selectors.integrationList)).toContainText('Bankhoes');
  await page.locator(selectors.addAccountButton).click();
  await expect(page.locator(selectors.integrationForm)).toBeVisible();
  await expect(page.locator('#accountName')).toBeFocused();
  await fillConnection(page);
  await page.locator('#integrationSaveButton').click();

  await expect(page.locator('[data-testid="integration-overview-status"]')).toContainText('Client North is now available as a scanner tab');
  await expect(page.locator(selectors.integrationList)).toContainText('Client North');
  await expect(page.locator('#bolClientSecret')).toHaveValue('');
  await expect(page.locator('#integrationPassword')).toHaveValue('');
  const clientTab = page.locator('[data-testid^="account-tab-acct_"]');
  await expect(clientTab).toHaveText('Client North');

  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(JSON.stringify(storage)).not.toContain('north-secret-value');
  expect(JSON.stringify(storage)).not.toContain('north-client');
  await page.locator('#integrationCloseButton').click();
  await expect(page.locator(selectors.scanInput)).toBeFocused();
  await clientTab.click();
  await expect(clientTab).toHaveAttribute('aria-selected', 'true');
});

test('Bol-rejected credentials create no tab and clear secret fields before retry', async ({ page }) => {
  await openConnections(page);
  await page.locator(selectors.addAccountButton).click();
  await fillConnection(page, { name: 'Rejected Client', clientId: 'rejected-client', clientSecret: 'rejected-secret' });
  await page.locator('#integrationSaveButton').click();
  await expect(page.locator(selectors.integrationFormStatus)).toContainText('Bol did not accept these credentials');
  await expect(page.locator('#bolClientSecret')).toHaveValue('');
  await expect(page.locator('#integrationPassword')).toHaveValue('');
  await expect(page.locator('#bolClientSecret')).toBeFocused();
  await expect(page.locator('[data-testid^="account-tab-acct_"]')).toHaveCount(0);
  await expect(page.locator(selectors.integrationList)).not.toContainText('Rejected Client');
});

test('saved connection is not called tab-ready when the required snapshot cannot load', async ({ page }) => {
  await openConnections(page);
  await page.evaluate(() => window.__apiMock.addFailure({ kind: 'accounts', status: 503, code: 'synthetic_snapshot_failure' }));
  await page.locator(selectors.addAccountButton).click();
  await fillConnection(page, { name: 'Client Paused', clientId: 'paused-client', clientSecret: 'paused-secret' });
  await page.locator('#integrationSaveButton').click();
  const status = page.locator('[data-testid="integration-overview-status"]');
  await expect(status).toContainText('Client Paused is connected, but its scanner tab could not be loaded');
  await expect(status).toHaveAttribute('data-tone', 'warning');
  await expect(page.locator('[data-testid^="account-tab-acct_"]')).toHaveCount(0);
  await expect(page.locator('#bolClientSecret')).toHaveValue('');
  await expect(page.locator('#integrationPassword')).toHaveValue('');
});

test('internal Bol credentials update in place without renaming or creating a tab', async ({ page }) => {
  await openConnections(page);
  await page.locator('[data-account="primary"] button[data-integration-update]').click();
  await expect(page.locator('#integrationFormTitle')).toContainText('Bankhoes');
  await expect(page.locator('#accountNameField')).toBeHidden();
  await fillConnection(page, { clientId: 'bankhoes-updated', clientSecret: 'bankhoes-secret-updated' });
  await page.locator('#integrationSaveButton').click();
  await expect(page.locator('[data-testid="integration-overview-status"]')).toContainText('Bankhoes is now available as a scanner tab');
  await expect(page.locator('[data-testid^="account-tab-acct_"]')).toHaveCount(0);
  const calls = await page.evaluate(() => window.__apiMock.callsOf('integrations'));
  expect(calls.at(-1).method).toBe('PUT');
  expect(calls.at(-1).body.accountKey).toBe('primary');
  expect(calls.at(-1).body).not.toHaveProperty('accountName');
});

test.describe('mobile Bol connection manager', () => {
  test.use({ viewportSize: { width: 390, height: 844 } });

  test('contains its layout and returns focus to the scan loop on close', async ({ page }) => {
    await openConnections(page);
    await page.locator(selectors.addAccountButton).click();
    const geometry = await page.locator('.integration-panel').evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      rect: element.getBoundingClientRect().toJSON(),
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.rect.left).toBeGreaterThanOrEqual(0);
    expect(geometry.rect.right).toBeLessThanOrEqual(390);
    await page.keyboard.press('Escape');
    await expect(page.locator(selectors.integrationDialog)).toBeHidden();
    await expect(page.locator(selectors.scanInput)).toBeFocused();
  });
});

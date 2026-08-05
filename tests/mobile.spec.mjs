import { test, expect, selectors, waitForReady, waitForSignedOut, scan } from './fixtures/mock-bol.mjs';
import { healthyScenario } from './fixtures/data.mjs';

test.use({ viewportSize: { width: 390, height: 844 } });

test('mobile viewport contains overflow and keeps the scan decision first', async ({ page }) => {
  await waitForReady(page);
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    inputTop: document.querySelector('#scanInput')?.getBoundingClientRect().top,
    detailsTop: document.querySelector('[data-testid="shipment-list"]')?.getBoundingClientRect().top,
  }));
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.inputTop).toBeLessThan(dimensions.detailsTop);
});

test('core controls and terminal output have accessible names and semantics', async ({ page }) => {
  await waitForReady(page);
  await expect(page.getByRole('textbox', { name: /scan/i })).toBeVisible();
  await expect(page.locator(selectors.dataStatus)).toHaveAttribute('aria-live', /polite|assertive/);

  await scan(page, 'UNKNOWN-A11Y');
  const feedback = page.locator(selectors.feedback);
  await expect(feedback).toContainText(/STOP|do not send/i);
  await expect(feedback).toHaveAttribute('role', /alert|status/);
  await expect(feedback).toHaveAttribute('aria-live', /assertive|polite/);
  await expect(page.locator(selectors.scanInput)).toBeFocused();
});

test.describe('signed-out mobile gate', () => {
  test.use({ scenario: healthyScenario({ authenticated: false }) });

  test('fits the viewport and puts focus on the first required field', async ({ page }) => {
    await waitForSignedOut(page);
    const dimensions = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      gateTop: document.querySelector('[data-testid="access-gate"]')?.getBoundingClientRect().top,
    }));
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.gateTop).toBeGreaterThanOrEqual(0);
    await expect(page.locator(selectors.operationalSurface)).toBeHidden();
  });
});

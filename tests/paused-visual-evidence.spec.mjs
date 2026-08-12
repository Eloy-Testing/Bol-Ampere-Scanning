import { test, expect, selectors } from './fixtures/mock-bol.mjs';
import { healthyScenario } from './fixtures/data.mjs';

test.use({ scenario: healthyScenario({ failures: [{ kind: 'shipments', page: 1 }] }) });

test('renders truthful paused desktop and mobile states for main-session inspection', async ({ page }, testInfo) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  await page.setViewportSize({ width: 1440, height: 980 });
  await expect(page.locator(selectors.dataStatus)).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#scanTitle')).toHaveText('Scanning paused');
  await page.screenshot({
    path: testInfo.outputPath('transient-bol-read-recovery-paused-desktop.png'),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.locator('#scanTitle')).toHaveText('Scanning paused');
  await page.screenshot({
    path: testInfo.outputPath('transient-bol-read-recovery-paused-mobile.png'),
    fullPage: true,
  });

  const geometry = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    retryVisible: !document.querySelector('[data-testid="retry-data"]')?.hidden,
    inputDisabled: document.querySelector('#scanInput')?.disabled === true,
  }));
  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.retryVisible).toBe(true);
  expect(geometry.inputDisabled).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toHaveLength(1);
  expect(consoleErrors[0]).toMatch(/failed to load resource.*503/i);
});

import { test, expect } from '@playwright/test';

const fixedEpoch = Date.parse('2026-08-19T10:00:00.000Z');

async function installFixedClock(page, epoch = fixedEpoch) {
  await page.addInitScript(({ value }) => { window.__BHP_FIXED_EPOCH__ = value; }, { value: epoch });
}

test.beforeEach(async ({ page }) => {
  await installFixedClock(page);
});

test('renders a production-shaped BHP operations command center with realistic fulfillment structures', async ({ page }) => {
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/operations-dashboard/index.html', { waitUntil: 'domcontentloaded' });

  await expect(page).toHaveTitle('BHP Operations Control');
  await expect(page.locator('.terminal-logo')).toHaveAttribute('src', 'assets/brand/bhp-logo-horizontal.png');
  await expect(page.locator('.terminal-logo')).toHaveAttribute('alt', 'Brand House Partners');
  await expect(page.locator('.footer-logo')).toHaveAttribute('src', 'assets/brand/bhp-logo-compact.png');
  await expect(page.locator('.footer-logo')).toHaveAttribute('alt', 'Brand House Partners');
  const brandAssetsLoaded = await page.locator('.terminal-logo, .footer-logo').evaluateAll((logos) => logos.every((logo) => logo.complete && logo.naturalWidth > 0));
  expect(brandAssetsLoaded).toBe(true);
  const visibleCopy = await page.locator('body').innerText();
  expect(visibleCopy).not.toMatch(/\b(demo|mock|fictioneel|fictief|prototype|staging|concept|voorbeeld)\b/i);
  expect(visibleCopy).not.toMatch(/\b(activity|activiteit|operator|qty|voorraadnauwkeurigheid|voorraadnauwkeurig)\b/i);
  await expect(page.getByRole('heading', { name: /Operatie, vandaag/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Beslissingen voor de cut-off' })).toBeVisible();
  await expect(page.locator('#stageFlow .flow-stage')).toHaveCount(7);
  await expect(page.locator('#stageFlow')).toContainText('Order intake');
  await expect(page.locator('#stageFlow')).toContainText('Carrier handover');
  await expect(page.locator('#movementRows tr')).toHaveCount(8);
  await expect(page.locator('#movementRows')).toContainText(/MOV-\d+/);
  await expect(page.locator('#movementRows')).toContainText(/PICK_CONFIRMED|PACK_QA|REPLENISHMENT|CYCLE_COUNT|INBOUND_RELEASE|RETURN_RESTOCK/);
  const movementIntegrity = await page.locator('#movementRows tr').evaluateAll((rows) => rows.map((row) => {
    const object = row.querySelector('td:nth-child(3) strong')?.textContent || '';
    const clientCode = row.querySelector('td:nth-child(3) .muted')?.textContent || '';
    const route = [...row.querySelectorAll('td:nth-child(4) .mono')].map((node) => node.textContent || '');
    return { object, clientCode, route, cellCount: row.querySelectorAll('td').length };
  }));
  const stockItUpSkus = [
    'Microfibre - Robe design four seat - Black',
    'Velvet - USA Size two seat - Taupe',
    'BH0001731',
    'Velvet - Choco - 3 seater-N',
    'Velvet - Ottoman M - Sand',
    'BH0001738',
    'Velvet - Pink - 1 seater-NEW',
    'Velvet - Robe design three seat - Taupe',
    'Microfibre - Robe design three seat - Black',
  ];
  for (const row of movementIntegrity) {
    expect(stockItUpSkus).toContain(row.object);
    expect(row.clientCode).toMatch(/^(BHD|LCD|SFZ)$/);
    expect(row.cellCount).toBe(6);
    expect(row.route[0]).toBe('Location 0');
    expect(row.route[1]).toMatch(/^1\.D\.[1-6]\.[LMR]$/);
  }
  await expect(page.locator('#shipmentList .shipment')).toHaveCount(4);
  await expect(page.locator('#returnList .return-row')).toHaveCount(4);
  await expect(page.locator('.secondary-grid')).toContainText(/klantportfolio/i);
  expect(errors).toEqual([]);
});

test('keeps deterministic day state across refresh and advances on the invisible ticker', async ({ page }) => {
  await page.goto('/operations-dashboard/index.html', { waitUntil: 'domcontentloaded' });
  const before = await page.evaluate(() => ({
    day: document.documentElement.dataset.operationDay,
    bucket: Number(document.documentElement.dataset.operationSequence),
    orders: document.querySelector('#ordersValue')?.textContent,
    movement: document.querySelector('#movementRows tr td:nth-child(2)')?.textContent,
  }));

  await page.reload({ waitUntil: 'domcontentloaded' });
  const afterReload = await page.evaluate(() => ({
    day: document.documentElement.dataset.operationDay,
    orders: document.querySelector('#ordersValue')?.textContent,
    movement: document.querySelector('#movementRows tr td:nth-child(2)')?.textContent,
  }));
  expect(afterReload).toEqual({ day: before.day, orders: before.orders, movement: before.movement });

  await expect.poll(async () => Number(await page.locator('html').getAttribute('data-operation-sequence')), { timeout: 8_000 })
    .toBeGreaterThan(before.bucket);
});

test('resets the deterministic operation on the next Amsterdam day', async ({ browser, baseURL }) => {
  const firstContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  await installFixedClock(firstPage, Date.parse('2026-08-19T05:15:00.000Z'));
  await firstPage.goto(`${baseURL}/operations-dashboard/index.html`, { waitUntil: 'domcontentloaded' });
  const first = await firstPage.evaluate(() => ({
    day: document.documentElement.dataset.operationDay,
    movement: document.querySelector('#movementRows tr td:nth-child(2)')?.textContent,
    orders: document.querySelector('#ordersValue')?.textContent,
  }));

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await installFixedClock(secondPage, Date.parse('2026-08-20T05:15:00.000Z'));
  await secondPage.goto(`${baseURL}/operations-dashboard/index.html`, { waitUntil: 'domcontentloaded' });
  const second = await secondPage.evaluate(() => ({
    day: document.documentElement.dataset.operationDay,
    movement: document.querySelector('#movementRows tr td:nth-child(2)')?.textContent,
    orders: document.querySelector('#ordersValue')?.textContent,
  }));

  expect(first.day).not.toBe(second.day);
  expect(first.movement).not.toBe(second.movement);
  expect(first.orders).not.toBe(second.orders);
  await firstContext.close();
  await secondContext.close();
});

test('supports decision details and the StockItUp-backed portfolio scope', async ({ page }) => {
  await page.goto('/operations-dashboard/index.html', { waitUntil: 'domcontentloaded' });
  const portfolioVolume = await page.locator('#clientList .client-row').first().textContent();

  await page.getByRole('button', { name: 'Open dossier →' }).first().click();
  await expect(page.locator('#exceptionDialog')).toBeVisible();
  await expect(page.locator('#dialogDetails .detail')).toHaveCount(9);
  await expect(page.locator('#dialogRecommendation')).not.toBeEmpty();
  await page.getByRole('button', { name: 'Sluit dossier' }).click();

  await page.getByTestId('client-scope').selectOption('bankhoesdiscounter');
  await expect(page.locator('#assistiveStatus')).toHaveText('Overzicht bijgewerkt voor de gekozen klant.');
  await expect(page.getByTestId('client-scope')).toHaveValue('bankhoesdiscounter');
  await expect(page.locator('#clientList .client-row').first()).toHaveText(portfolioVolume);
});

test('supports the consolidated ledger, global search and operations help', async ({ page }) => {
  await page.goto('/operations-dashboard/index.html', { waitUntil: 'domcontentloaded' });

  await page.getByRole('tab', { name: 'Warehouse movements' }).click();
  await expect(page.getByRole('tab', { name: 'Warehouse movements' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#movementsPanel')).toBeVisible();

  const movementId = (await page.locator('#movementRows tr').first().locator('td:nth-child(2)').textContent())?.trim();
  await page.getByTestId('global-search').fill(movementId || 'MOV-');
  await expect(page.locator('#movementRows tr:visible')).toHaveCount(1);
  await page.getByTestId('global-search').fill('geen-operationele-match-000');
  await expect(page.locator('#searchEmpty')).toBeVisible();
  await page.getByTestId('global-search').fill('');

  await page.getByRole('button', { name: 'Open bedieningshulp' }).click();
  await expect(page.getByRole('dialog', { name: 'Bedieningshulp' })).toBeVisible();
  await page.getByRole('button', { name: 'Sluiten' }).click();
  await expect(page.getByRole('dialog', { name: 'Bedieningshulp' })).toBeHidden();
});

test('preserves the decision-first order without page overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/operations-dashboard/index.html', { waitUntil: 'domcontentloaded' });

  const geometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    decisionTop: document.querySelector('#primaryDecision')?.getBoundingClientRect().top,
    flowTop: document.querySelector('.flow-section')?.getBoundingClientRect().top,
    contextTop: document.querySelector('.secondary-grid')?.getBoundingClientRect().top,
  }));

  expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.decisionTop).toBeLessThan(geometry.flowTop);
  expect(geometry.flowTop).toBeLessThan(geometry.contextTop);
  await expect(page.getByRole('button', { name: 'Open dossier →' }).first()).toBeVisible();
});

test('keeps Flow through Ledger operational copy at readable desktop and mobile sizes', async ({ page }) => {
  const readTypeSizes = async () => page.evaluate(() => {
    const size = (selector) => Number.parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
    return {
      sectionHeading: size('.flow-section .section-head h2'),
      sectionNote: size('.flow-section .section-note'),
      stageLabel: size('.stage-label'),
      stageDetail: size('.stage-detail'),
      ledgerTab: size('.ledger-tab'),
      tableHeading: size('.movement-table th'),
      tableBody: size('.movement-table td'),
      status: size('.movement-table .status'),
      shipmentHeading: size('.shipment h4'),
      shipmentDetail: size('.shipment p'),
      shipmentId: size('.shipment-id'),
      globalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/operations-dashboard/index.html', { waitUntil: 'domcontentloaded' });
  const desktop = await readTypeSizes();
  expect(desktop).toMatchObject({
    sectionHeading: 18,
    sectionNote: 10,
    stageLabel: 13,
    stageDetail: 11,
    ledgerTab: 11,
    tableHeading: 10,
    tableBody: 11,
    status: 10,
    shipmentHeading: 12,
    shipmentDetail: 10,
    shipmentId: 10,
    globalOverflow: false,
  });

  await page.setViewportSize({ width: 390, height: 900 });
  const mobile = await readTypeSizes();
  expect(mobile.stageLabel).toBeGreaterThanOrEqual(13);
  expect(mobile.stageDetail).toBeGreaterThanOrEqual(11);
  expect(mobile.tableBody).toBeGreaterThanOrEqual(11);
  expect(mobile.status).toBeGreaterThanOrEqual(10);
  expect(mobile.shipmentDetail).toBeGreaterThanOrEqual(10);
  expect(mobile.globalOverflow).toBe(false);
});

test('makes Overzicht compact while Flow and Ledger share larger navigation areas', async ({ page }) => {
  const tabWidths = async () => page.locator('.terminal-tab').evaluateAll((tabs) => tabs.map((tab) => tab.getBoundingClientRect().width));

  for (const width of [1600, 1023, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/operations-dashboard/index.html', { waitUntil: 'domcontentloaded' });
    const [overview, flow, ledger] = await tabWidths();
    expect(overview).toBeLessThan(flow);
    expect(Math.abs(flow - ledger)).toBeLessThanOrEqual(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  }
});

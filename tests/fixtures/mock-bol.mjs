import { test as base, expect } from '@playwright/test';
import { healthyScenario } from './data.mjs';

export const selectors = Object.freeze({
  accessGate: '[data-testid="access-gate"]',
  accessForm: '[data-testid="access-form"]',
  authStatus: '[data-testid="auth-status"]',
  operationalSurface: '[data-testid="operational-surface"]',
  scanInput: '#scanInput',
  dataStatus: '[data-testid="data-status"]',
  retryData: '[data-testid="retry-data"]',
  refreshData: '[data-testid="refresh-data"]',
  feedback: '[data-testid="scan-feedback"]',
  queueDepth: '[data-testid="scan-queue-depth"]',
  scannedCount: '[data-testid="scanned-count"]',
  shipmentList: '[data-testid="shipment-list"]',
  stopList: '[data-testid="stop-list"]',
  ordersBeforeCutoff: '[data-testid="orders-before-cutoff"]',
  ordersAfterCutoff: '[data-testid="orders-after-cutoff"]',
});

function jsonResponse(route, payload, status = 200, headers = {}) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    headers: { 'Cache-Control': 'no-store', ...headers },
    body: JSON.stringify(payload),
  });
}

function pageSlice(records, page, pageSize) {
  return records.slice((page - 1) * pageSize, page * pageSize);
}

function configuredAccounts(snapshot) {
  return snapshot?.accounts && typeof snapshot.accounts === 'object' ? Object.keys(snapshot.accounts) : ['primary'];
}

function accountSnapshot(snapshot, account) {
  if (!snapshot?.accounts) return account === 'primary' ? snapshot : null;
  return snapshot.accounts[account] || null;
}

function failureMatches(rule, call, priorCalls) {
  if (rule.kind !== call.kind) return false;
  if (rule.identifier && rule.identifier !== call.identifier) return false;
  if (rule.account && rule.account !== call.account) return false;
  if (rule.page && rule.page !== call.page) return false;
  if (rule.trackingCode && rule.trackingCode !== call.trackingCode) return false;
  return rule.fromCall == null || priorCalls.filter((entry) => entry.kind === call.kind).length >= rule.fromCall;
}

function currentCanonicalState(state) {
  const records = [...(state.recordsByWorkday.get(state.workday) || [])];
  const scanned = {};
  const cancelled = [];
  const stops = [];
  for (const record of records) {
    if (record.outcome === 'success') scanned[record.trackingCode] = record.recordedAt;
    else if (record.outcome === 'cancelled') cancelled.push({ code: record.trackingCode, orderId: record.orderId, time: record.recordedAt });
    else if (record.outcome === 'unknown' || record.outcome === 'unverified') stops.push({ code: record.trackingCode, orderId: record.orderId, reason: record.outcome, time: record.recordedAt });
  }
  return { workday: state.workday, records, scanned, cancelled, stops };
}

export const test = base.extend({
  scenario: [healthyScenario(), { option: true }],
  now: ['2026-08-05T10:00:00Z', { option: true }],
  viewportSize: [null, { option: true }],

  page: async ({ page, context, scenario, now, viewportSize }, use) => {
    if (viewportSize) await page.setViewportSize(viewportSize);
    await page.clock.install({ time: new Date(now) });

    const cloned = JSON.parse(JSON.stringify(scenario));
    const state = {
      scenario: cloned,
      authenticated: cloned.authenticated !== false,
      logoutPending: false,
      session: {
        stationId: cloned.session?.stationId || 'PACK-01',
        operatorLabel: cloned.session?.operatorLabel || 'Warehouse operator',
        expiresAt: cloned.session?.expiresAt || '2026-08-05T18:00:00Z',
      },
      password: cloned.password || 'warehouse-pass',
      activeSnapshot: cloned.activeSnapshot || 0,
      workday: cloned.workday || '2026-08-05',
      calls: [],
      recordsByWorkday: new Map(),
      activeScans: 0,
      maxConcurrentScans: 0,
    };
    state.recordsByWorkday.set(state.workday, Array.isArray(cloned.records) ? cloned.records.map((entry) => ({ ...entry })) : []);

    const externalRequests = [];
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
      if (!isLocal) {
        externalRequests.push(request.url());
        await route.abort('blockedbyclient');
        return;
      }

      if (url.pathname === '/__api-mock/control') {
        const command = request.postDataJSON();
        if (command.action === 'setSnapshot') state.activeSnapshot = Number(command.payload);
        else if (command.action === 'addFailure') state.scenario.failures.push(command.payload);
        else if (command.action === 'clearFailures') state.scenario.failures = [];
        else if (command.action === 'expireSession') state.authenticated = false;
        else if (command.action === 'setWorkday') {
          state.workday = String(command.payload);
          if (!state.recordsByWorkday.has(state.workday)) state.recordsByWorkday.set(state.workday, []);
        } else if (command.action === 'setVerifierFailure') {
          const active = state.scenario.snapshots[state.activeSnapshot] || state.scenario.snapshots[0];
          for (const account of configuredAccounts(active)) {
            const source = accountSnapshot(active, account);
            if (source?.verifiers?.[command.payload]) source.verifiers[command.payload].fail = true;
          }
        }
        await jsonResponse(route, { ok: true });
        return;
      }

      if (!url.pathname.startsWith('/api/')) {
        await route.continue();
        return;
      }

      const method = request.method();
      const resource = url.searchParams.get('resource');
      const identifier = url.searchParams.get('id');
      const account = url.searchParams.get('account');
      const pageNumber = Number(url.searchParams.get('page') || 1);
      let body = null;
      try { body = request.postDataJSON(); } catch (_) {}
      let kind = url.pathname.slice('/api/'.length);
      if (kind === 'retailer') kind = resource === 'order' ? 'orderDetail' : resource === 'shipment' ? 'shipmentDetail' : resource || 'retailer';
      if (kind === 'session' && method === 'POST') kind = 'login';
      if (kind === 'session' && method === 'DELETE') kind = 'logout';
      const call = {
        kind,
        method,
        identifier,
        account: account || body?.account || null,
        page: pageNumber,
        trackingCode: body?.trackingCode,
        body,
        startedAt: Date.now(),
      };
      state.calls.push(call);
      const rule = (state.scenario.failures || []).find((entry) => failureMatches(entry, call, state.calls));
      const delay = rule?.delayMs ?? state.scenario.delays?.[kind] ?? 0;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (rule) {
        call.finishedAt = Date.now();
        if (rule.networkError) {
          await route.abort('failed');
          return;
        }
        if (kind === 'logout') state.logoutPending = true;
        await jsonResponse(route, { error: { code: rule.code || 'synthetic_failure' } }, rule.status || 503);
        return;
      }

      if (url.pathname === '/api/session' && method === 'GET') {
        call.finishedAt = Date.now();
        await jsonResponse(route, state.logoutPending
          ? { authenticated: false, logoutPending: true }
          : state.authenticated ? { authenticated: true, session: state.session } : { authenticated: false });
        return;
      }
      if (url.pathname === '/api/session' && method === 'POST') {
        if (state.logoutPending) {
          await jsonResponse(route, { error: { code: 'logout_pending' } }, 409);
          return;
        }
        if (state.scenario.loginOutcome === 'locked') {
          await jsonResponse(route, { error: { code: 'locked' } }, 423);
          return;
        }
        if (!body || body.password !== state.password) {
          await jsonResponse(route, { error: { code: 'invalid_credentials' } }, 401);
          return;
        }
        state.authenticated = true;
        state.session = { stationId: body.stationId, operatorLabel: body.operatorLabel, expiresAt: state.session.expiresAt };
        call.finishedAt = Date.now();
        await jsonResponse(route, { authenticated: true, session: state.session });
        return;
      }
      if (url.pathname === '/api/session' && method === 'DELETE') {
        state.authenticated = false;
        state.logoutPending = false;
        call.finishedAt = Date.now();
        await jsonResponse(route, { authenticated: false });
        return;
      }

      if (!state.authenticated) {
        call.finishedAt = Date.now();
        await jsonResponse(route, { error: { code: 'session_expired' } }, 401);
        return;
      }

      if (url.pathname === '/api/state') {
        call.finishedAt = Date.now();
        await jsonResponse(route, currentCanonicalState(state));
        return;
      }

      const activeRoot = state.scenario.snapshots[state.activeSnapshot] || state.scenario.snapshots[0];
      if (url.pathname === '/api/retailer' && resource === 'accounts') {
        call.finishedAt = Date.now();
        await jsonResponse(route, { accounts: configuredAccounts(activeRoot) });
        return;
      }
      const active = accountSnapshot(activeRoot, account || body?.account || 'primary');
      if (!active) {
        call.finishedAt = Date.now();
        await jsonResponse(route, { error: { code: 'not_found' } }, 404);
        return;
      }
      if (url.pathname === '/api/retailer' && resource === 'orders') {
        const records = pageSlice(active.orders || [], pageNumber, active.pageSize || 50);
        call.finishedAt = Date.now();
        await jsonResponse(route, { data: { orders: records, page: pageNumber, totalPages: Math.max(1, Math.ceil((active.orders || []).length / (active.pageSize || 50))), totalElements: (active.orders || []).length } });
        return;
      }
      if (url.pathname === '/api/retailer' && resource === 'shipments') {
        const records = pageSlice(active.shipments || [], pageNumber, active.pageSize || 50);
        call.finishedAt = Date.now();
        await jsonResponse(route, { data: { shipments: records, page: pageNumber, totalPages: Math.max(1, Math.ceil((active.shipments || []).length / (active.pageSize || 50))), totalElements: (active.shipments || []).length } });
        return;
      }
      if (url.pathname === '/api/retailer' && resource === 'order') {
        const detail = active.orderDetails?.[identifier];
        call.finishedAt = Date.now();
        await jsonResponse(route, detail ? { data: detail } : { error: { code: 'not_found' } }, detail ? 200 : 404);
        return;
      }
      if (url.pathname === '/api/retailer' && resource === 'shipment') {
        const detail = active.shipmentDetails?.[identifier];
        call.finishedAt = Date.now();
        await jsonResponse(route, detail ? { data: detail } : { error: { code: 'not_found' } }, detail ? 200 : 404);
        return;
      }

      if (url.pathname === '/api/scan' && method === 'POST') {
        state.activeScans += 1;
        state.maxConcurrentScans = Math.max(state.maxConcurrentScans, state.activeScans);
        const trackingCode = String(body?.trackingCode || '').trim().toUpperCase();
        const detail = body?.shipmentId
          ? Object.values(active.shipmentDetails || {}).find((entry) => String(entry.transport?.trackAndTrace || '').trim().toUpperCase() === trackingCode)
          : null;
        const verifier = detail ? active.verifiers?.[detail.order?.orderId] : null;
        if (verifier?.delayMs) await new Promise((resolve) => setTimeout(resolve, verifier.delayMs));
        const records = state.recordsByWorkday.get(state.workday) || [];
        const existingIndex = records.findIndex((entry) => entry.trackingCode === trackingCode);
        const existing = records[existingIndex];
        const shipmentItemIds = new Set((detail?.shipmentItems || []).map((item) => item.orderItemId));
        const relevantVerifierItems = (verifier?.orderItems || []).filter((item) => shipmentItemIds.has(item.orderItemId));
        const hasRelevantCancellation = relevantVerifierItems.some((item) => item.cancellationRequest === true || item.cancellationRequested === true || Number(item.quantityCancelled || 0) > 0);
        let outcome = 'unknown';
        if (!detail && body?.verificationIncomplete === true) outcome = 'unverified';
        else if (detail && body?.shipmentId !== detail.shipmentId) outcome = 'unverified';
        else if (verifier?.fail) outcome = 'unverified';
        else if (detail && (hasRelevantCancellation || (verifier?.cancelled && relevantVerifierItems.length === 0))) outcome = 'cancelled';
        else if (detail && existing?.outcome === 'success') outcome = 'duplicate';
        else if (detail) outcome = 'success';
        const canonicalOutcome = outcome === 'duplicate' ? 'success' : outcome;
        const record = {
          trackingCode,
          shipmentId: detail?.shipmentId || '',
          orderId: detail?.order?.orderId || '',
          sourceAccount: detail ? body?.account || null : null,
          outcome: canonicalOutcome,
          recordedAt: new Date().toISOString(),
        };
        if (!existing || outcome === 'cancelled' || !['success', 'cancelled'].includes(existing.outcome)) {
          if (existingIndex >= 0) records[existingIndex] = record;
          else records.unshift(record);
          state.recordsByWorkday.set(state.workday, records);
        }
        state.activeScans -= 1;
        call.finishedAt = Date.now();
        await jsonResponse(route, { outcome, message: outcome === 'success' ? 'Package cleared.' : 'Package not counted.', state: currentCanonicalState(state) }, 200, { 'x-api-mock-max-concurrent': String(state.maxConcurrentScans) });
        return;
      }

      call.finishedAt = Date.now();
      await jsonResponse(route, { error: { code: 'not_found' } }, 404);
    });

    await page.addInitScript(() => {
      localStorage.setItem('ampere_language_v2', 'en');
      const nativeFetch = window.fetch.bind(window);
      const instrumentation = {
        calls: [],
        activeScans: 0,
        maxConcurrentScans: 0,
        callsOf(kind) { return this.calls.filter((call) => call.kind === kind); },
        control(action, payload) { return nativeFetch('/__api-mock/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) }).then((response) => response.json()); },
        setSnapshot(index) { return this.control('setSnapshot', index); },
        addFailure(rule) { return this.control('addFailure', rule); },
        clearFailures() { return this.control('clearFailures'); },
        expireSession() { return this.control('expireSession'); },
        setWorkday(value) { return this.control('setWorkday', value); },
        setVerifierFailure(orderId) { return this.control('setVerifierFailure', orderId); },
      };
      window.__apiMock = instrumentation;
      window.fetch = async (input, init = {}) => {
        const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
        if (!url.pathname.startsWith('/api/')) return nativeFetch(input, init);
        const method = String(init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
        const resource = url.searchParams.get('resource');
        let kind = url.pathname.slice('/api/'.length);
        if (kind === 'retailer') kind = resource === 'order' ? 'orderDetail' : resource === 'shipment' ? 'shipmentDetail' : resource || 'retailer';
        if (kind === 'session' && method === 'POST') kind = 'login';
        if (kind === 'session' && method === 'DELETE') kind = 'logout';
        let body = null;
        try { body = typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (_) {}
        const call = { kind, method, page: Number(url.searchParams.get('page') || 1), identifier: url.searchParams.get('id'), body, startedAt: Date.now() };
        instrumentation.calls.push(call);
        if (kind === 'scan') {
          instrumentation.activeScans += 1;
          instrumentation.maxConcurrentScans = Math.max(instrumentation.maxConcurrentScans, instrumentation.activeScans);
        }
        try {
          const response = await nativeFetch(input, init);
          call.status = response.status;
          call.finishedAt = Date.now();
          const serverMax = Number(response.headers.get('x-api-mock-max-concurrent') || 0);
          instrumentation.maxConcurrentScans = Math.max(instrumentation.maxConcurrentScans, serverMax);
          return response;
        } finally {
          if (kind === 'scan') instrumentation.activeScans -= 1;
        }
      };
    });

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    page.externalRequests = externalRequests;
    await use(page);
  },
});

export { expect };

export async function waitForSignedOut(page) {
  await expect(page.locator(selectors.accessGate)).toBeVisible();
  await expect(page.locator(selectors.accessForm)).toBeVisible();
  await expect(page.locator('#stationId')).toBeFocused();
}

export async function signIn(page, { stationId = 'PACK-01', operatorLabel = 'Warehouse operator', password = 'warehouse-pass' } = {}) {
  await page.locator('#stationId').fill(stationId);
  await page.locator('#operatorLabel').fill(operatorLabel);
  await page.locator('#warehousePassword').fill(password);
  await page.locator('#loginButton').click();
}

export async function waitForReady(page) {
  const input = page.locator(selectors.scanInput);
  await expect(page.locator(selectors.operationalSurface)).toBeVisible();
  await expect(input).toBeEnabled();
  await expect(input).toBeFocused();
}

export async function scan(page, code) {
  const input = page.locator(selectors.scanInput);
  await input.fill(code);
  await input.press('Enter');
}

export async function testState(page) {
  return page.evaluate(() => {
    if (!window.__scannerTest || typeof window.__scannerTest.getState !== 'function') {
      throw new Error('index.html must expose window.__scannerTest.getState() for deterministic contract tests');
    }
    return window.__scannerTest.getState();
  });
}

export async function acceptedCount(page) {
  return page.locator(selectors.scannedCount).evaluate((element) => Number(element.textContent?.match(/\d+/)?.[0] || 0));
}

export async function scanCalls(page) {
  return page.evaluate(() => window.__apiMock.callsOf('scan').map((call) => call.body?.trackingCode));
}

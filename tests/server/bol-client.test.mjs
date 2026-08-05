import assert from 'node:assert/strict';
import test from 'node:test';
import { BolClient, sanitizeOrder, sanitizeShipment } from '../../server/bol-client.mjs';

function json(body, init = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
}

test('bol client caches OAuth tokens, retries one 401, and never returns customer fields', async () => {
  const calls = [];
  let tokenNumber = 0;
  let retailerCalls = 0;
  const client = new BolClient({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    nodeEnv: 'test',
    tokenUrl: 'https://bol.test/token',
    apiBaseUrl: 'https://bol.test/retailer',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/token')) return json({ access_token: `access-token-${++tokenNumber}`, expires_in: 299 });
      retailerCalls += 1;
      if (retailerCalls === 1) return json({}, { status: 401 });
      return json({
        orders: [{ orderId: 'ORDER-1', orderPlacedDateTime: '2026-08-05T10:00:00Z', customerDetails: { name: 'Secret' } }],
      });
    },
  });
  const first = await client.getOrdersPage(1);
  const second = await client.getOrdersPage(2);
  assert.equal(tokenNumber, 2);
  assert.equal(first.orders[0].orderId, 'ORDER-1');
  assert.equal(Object.hasOwn(first.orders[0], 'customerDetails'), false);
  assert.equal(second.orders.length, 1);
  assert.equal(calls.filter((call) => call.url.endsWith('/token')).length, 2);
});

test('complete pagination continues until an explicit empty collection', async () => {
  const pages = [];
  const client = new BolClient({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    nodeEnv: 'test',
    tokenUrl: 'https://bol.test/token',
    apiBaseUrl: 'https://bol.test/retailer',
    fetchImpl: async (url) => {
      if (url.endsWith('/token')) return json({ access_token: 'token-value', expires_in: 299 });
      const page = Number(new URL(url).searchParams.get('page'));
      pages.push(page);
      return json(page < 3 ? { orders: [{ orderId: `ORDER-${page}`, orderPlacedDateTime: '2026-08-05T10:00:00Z' }] } : {});
    },
  });
  assert.deepEqual((await client.getAllOrders()).map((order) => order.orderId), ['ORDER-1', 'ORDER-2']);
  assert.deepEqual(pages, [1, 2, 3]);
});

test('malformed page envelopes and collection values are rejected rather than normalized', async () => {
  for (const [resource, body] of [
    ['orders', null],
    ['orders', []],
    ['orders', 'not-a-page'],
    ['orders', { orders: { orderId: 'NOT-A-COLLECTION' } }],
    ['shipments', 42],
    ['shipments', { shipments: 'NOT-A-COLLECTION' }],
  ]) {
    const client = new BolClient({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      nodeEnv: 'test',
      tokenUrl: 'https://bol.test/token',
      apiBaseUrl: 'https://bol.test/retailer',
      fetchImpl: async (url) => url.endsWith('/token')
        ? json({ access_token: 'token-value', expires_in: 299 })
        : json(body),
    });
    const action = resource === 'orders' ? () => client.getOrdersPage(1) : () => client.getShipmentsPage(1);
    await assert.rejects(action, { code: 'verification_unavailable' });
  }
});

test('upstream error bodies and credentials are not exposed', async () => {
  const client = new BolClient({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    nodeEnv: 'test',
    tokenUrl: 'https://bol.test/token',
    apiBaseUrl: 'https://bol.test/retailer',
    fetchImpl: async () => new Response('secret upstream payload', { status: 500 }),
  });
  await assert.rejects(() => client.getOrdersPage(1), (error) => {
    assert.equal(error.code, 'verification_unavailable');
    assert.doesNotMatch(error.message, /secret|client/i);
    return true;
  });
});

test('partial shipment and cancellation detail is rejected fail closed', () => {
  const shipment = {
    shipmentId: 'SHIPMENT-1',
    shipmentDateTime: '2026-08-05T10:00:00Z',
    order: { orderId: 'ORDER-1' },
    transport: { trackAndTrace: 'TRACK-1' },
    shipmentItems: [{ orderItemId: 'ITEM-1' }, {}],
  };
  assert.throws(() => sanitizeShipment(shipment, { detail: true }), { code: 'verification_unavailable' });
  assert.throws(() => sanitizeOrder({
    orderId: 'ORDER-1',
    orderPlacedDateTime: '2026-08-05T10:00:00Z',
    orderItems: [{ orderItemId: 'ITEM-1', quantityCancelled: 0 }],
  }, { detail: true }), { code: 'verification_unavailable' });
  assert.throws(() => sanitizeOrder({
    orderId: 'ORDER-1',
    orderPlacedDateTime: '2026-08-05T10:00:00Z',
    orderItems: [{ orderItemId: ' ', cancellationRequest: false, quantityCancelled: null }],
  }, { detail: true }), { code: 'verification_unavailable' });
  for (const orderItemId of ['ITEM 1', 'ITEM\n1', 'ITEM\t1']) {
    assert.throws(() => sanitizeShipment({
      shipmentId: 'SHIPMENT-1',
      shipmentDateTime: '2026-08-05T10:00:00Z',
      order: { orderId: 'ORDER-1' },
      transport: { trackAndTrace: 'TRACK-1' },
      shipmentItems: [{ orderItemId }],
    }, { detail: true }), { code: 'verification_unavailable' });
  }
  assert.throws(() => sanitizeOrder({
    orderId: 'ORDER-1',
    orderPlacedDateTime: 'not-a-date',
  }), { code: 'verification_unavailable' });
  assert.throws(() => sanitizeOrder({
    orderId: 'ORDER-1',
    orderPlacedDateTime: '2026-02-30T10:00:00Z',
  }), { code: 'verification_unavailable' });
});

test('detail responses must match the requested bol identifier', async () => {
  const client = new BolClient({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    nodeEnv: 'test',
    tokenUrl: 'https://bol.test/token',
    apiBaseUrl: 'https://bol.test/retailer',
    fetchImpl: async (url) => {
      if (url.endsWith('/token')) return json({ access_token: 'token-value', expires_in: 299 });
      if (url.includes('/orders/')) return json({
        orderId: 'OTHER-ORDER',
        orderPlacedDateTime: '2026-08-05T09:00:00Z',
        orderItems: [{ orderItemId: 'ITEM-1', cancellationRequest: false, quantityCancelled: 0 }],
      });
      return json({
        shipmentId: 'OTHER-SHIPMENT',
        shipmentDateTime: '2026-08-05T09:00:00Z',
        order: { orderId: 'ORDER-1' },
        transport: { trackAndTrace: 'TRACK-1' },
        shipmentItems: [{ orderItemId: 'ITEM-1' }],
      });
    },
  });
  await assert.rejects(() => client.getOrder('ORDER-1'), { code: 'verification_unavailable' });
  await assert.rejects(() => client.getShipment('SHIPMENT-1'), { code: 'verification_unavailable' });
});

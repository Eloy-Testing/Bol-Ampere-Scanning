import assert from 'node:assert/strict';
import test from 'node:test';
import { ReconciliationService, stableShipmentWindow } from '../../server/reconciliation-service.mjs';

function shipment({ shipmentId, orderId, track, shippedAt, itemId }) {
  return {
    summary: {
      shipmentId,
      shipmentDateTime: shippedAt,
      order: { orderId, orderPlacedDateTime: '2026-08-05T08:00:00.000Z' },
      shipmentItems: [{ orderItemId: itemId }],
    },
    detail: {
      shipmentId,
      shipmentDateTime: shippedAt,
      order: { orderId, orderPlacedDateTime: '2026-08-05T08:00:00.000Z' },
      transport: { trackAndTrace: track, transporterCode: 'TEST' },
      shipmentItems: [{ orderItemId: itemId }],
    },
  };
}

test('stable enumeration requires two matching passes', async () => {
  const first = shipment({ shipmentId: 'SHIPMENT-1', orderId: 'ORDER-1', track: 'TRACK-1', shippedAt: '2026-08-05T09:00:00.000Z', itemId: 'ITEM-1' });
  let pageOneCalls = 0;
  const client = {
    getShipmentsPage: async (page) => {
      if (page !== 1) return { shipments: [] };
      pageOneCalls += 1;
      return { shipments: [first.summary] };
    },
  };
  const rows = await stableShipmentWindow(client, new Date('2026-08-04T14:00:00.000Z'), new Date('2026-08-05T14:00:00.000Z'));
  assert.equal(rows.length, 1);
  assert.equal(pageOneCalls, 2);
});

test('refresh deduplicates shared tracking, keeps full item membership, and commits once', async () => {
  const first = shipment({ shipmentId: 'SHIPMENT-1', orderId: 'ORDER-1', track: 'TRACK-SHARED', shippedAt: '2026-08-05T09:00:00.000Z', itemId: 'ITEM-1' });
  const second = shipment({ shipmentId: 'SHIPMENT-2', orderId: 'ORDER-2', track: 'TRACK-SHARED', shippedAt: '2026-08-05T08:30:00.000Z', itemId: 'ITEM-2' });
  const byId = { [first.detail.shipmentId]: first.detail, [second.detail.shipmentId]: second.detail };
  const orders = {
    'ORDER-1': { orderId: 'ORDER-1', orderItems: [{ orderItemId: 'ITEM-1', cancellationRequest: true, quantityCancelled: 1 }] },
    'ORDER-2': { orderId: 'ORDER-2', orderItems: [{ orderItemId: 'ITEM-2', cancellationRequest: false, quantityCancelled: 0 }] },
  };
  const client = {
    getShipmentsPage: async (page) => ({ shipments: page === 1 ? [first.summary, second.summary] : [] }),
    getShipment: async (id) => byId[id],
    getOrder: async (id) => orders[id],
  };
  const calls = [];
  const repository = {
    recordReconciliationSnapshot: async (payload) => calls.push(['complete', payload]),
    recordReconciliationFailure: async (payload) => calls.push(['failed', payload]),
  };
  const source = { key: 'primary', label: 'Bankhoes', kind: 'internal', incarnation: 'bol_incarnation_one', client };
  const service = new ReconciliationService({
    repository,
    sourceProvider: { listSources: async () => [{ ...source, client: undefined }], getSource: async () => source },
    now: () => new Date('2026-08-05T10:00:00.000Z'),
  });
  const result = await service.refresh({ requestId: 'run-1' });
  assert.equal(result.packages, 1);
  assert.equal(calls.length, 1);
  const parcel = calls[0][1].packages[0];
  assert.equal(parcel.cancelled, false);
  assert.deepEqual(parcel.shipments.map((entry) => entry.shipmentId), ['SHIPMENT-2', 'SHIPMENT-1']);
  assert.deepEqual(parcel.shipments.flatMap((entry) => entry.items).map((entry) => [entry.orderItemId, entry.cancelled]).sort(), [
    ['ITEM-1', true],
    ['ITEM-2', false],
  ]);
});

test('unstable pagination fails without committing package counts', async () => {
  let pass = 0;
  const client = {
    getShipmentsPage: async (page) => {
      if (page !== 1) return { shipments: [] };
      pass += 1;
      const current = shipment({
        shipmentId: `SHIPMENT-${pass}`,
        orderId: `ORDER-${pass}`,
        track: `TRACK-${pass}`,
        shippedAt: '2026-08-05T09:00:00.000Z',
        itemId: `ITEM-${pass}`,
      });
      return { shipments: [current.summary] };
    },
  };
  const calls = [];
  const source = { key: 'primary', label: 'Bankhoes', incarnation: 'bol_incarnation_one', client };
  const service = new ReconciliationService({
    repository: {
      recordReconciliationSnapshot: async (payload) => calls.push(['complete', payload]),
      recordReconciliationFailure: async (payload) => calls.push(['failed', payload]),
    },
    sourceProvider: { listSources: async () => [{ ...source, client: undefined }], getSource: async () => source },
    now: () => new Date('2026-08-05T10:00:00.000Z'),
  });
  await assert.rejects(() => service.refresh({ requestId: 'run-unstable' }), { code: 'verification_unavailable' });
  assert.deepEqual(calls.map(([kind]) => kind), ['failed']);
});

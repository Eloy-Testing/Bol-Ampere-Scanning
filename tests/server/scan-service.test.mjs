import assert from 'node:assert/strict';
import test from 'node:test';
import { ScanService } from '../../server/scan-service.mjs';

function serviceFixture({ shipmentItems, orderItems }) {
  const decisions = [];
  const repository = {
    async recordScanDecision(decision) {
      decisions.push(decision);
      const record = {
        workday: decision.workday,
        trackingCode: decision.trackingCode,
        shipmentId: decision.shipmentId,
        orderId: decision.orderId,
        outcome: decision.outcome,
        reason: decision.reason,
        updatedAt: decision.now.toISOString(),
      };
      return { changed: true, record, records: [record] };
    },
  };
  const bolClient = {
    getShipment: async () => ({
      shipmentId: 'SHIPMENT-1',
      order: { orderId: 'ORDER-1' },
      transport: { trackAndTrace: 'TRACK-1' },
      shipmentItems,
    }),
    getOrder: async () => ({ orderId: 'ORDER-1', orderItems }),
  };
  return {
    decisions,
    service: new ScanService({ repository, bolClient, now: () => new Date('2026-08-05T10:00:00.000Z') }),
  };
}

const session = { stationId: 'PACK-01', principalId: 'operator-1', tokenHash: 'token-hash' };

test('cancellation is scoped to shipment items, not unrelated order items', async () => {
  const { service } = serviceFixture({
    shipmentItems: [{ orderItemId: 'ITEM-1' }],
    orderItems: [
      { orderItemId: 'ITEM-1', cancellationRequest: false, quantityCancelled: 0 },
      { orderItemId: 'UNRELATED', cancellationRequest: true, quantityCancelled: 1 },
    ],
  });
  const result = await service.decide({ trackingCode: 'TRACK-1', shipmentId: 'SHIPMENT-1', session, requestId: 'request-1' });
  assert.equal(result.outcome, 'success');
  assert.equal(result.counted, true);
});

test('malformed live identifiers persist an unverified decision', async () => {
  const { service, decisions } = serviceFixture({
    shipmentItems: [{ orderItemId: '' }],
    orderItems: [{ orderItemId: 'ITEM-1', cancellationRequest: false, quantityCancelled: 0 }],
  });
  const result = await service.decide({ trackingCode: 'TRACK-1', shipmentId: 'SHIPMENT-1', session, requestId: 'request-2' });
  assert.equal(result.outcome, 'unverified');
  assert.equal(result.counted, false);
  assert.equal(decisions[0].outcome, 'unverified');
});

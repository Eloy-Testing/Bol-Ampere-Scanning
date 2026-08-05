export function orderSummary({
  orderId,
  placedAt = '2026-08-05T08:00:00Z',
  ean = '8710000000001',
  cancellationRequested = false,
} = {}) {
  return {
    orderId,
    orderPlacedDateTime: placedAt,
    orderItems: [{
      ean,
      productTitle: `Warehouse item ${ean}`,
      quantity: 1,
      quantityShipped: 0,
      quantityCancelled: cancellationRequested ? 1 : 0,
      cancellationRequested,
      fulfilmentStatus: cancellationRequested ? 'CANCELLED' : 'OPEN',
      exactDeliveryDate: '2026-08-06',
    }],
  };
}

export function shipmentSummary({
  shipmentId,
  orderId,
  placedAt = '2026-08-05T08:00:00Z',
  shippedAt = '2026-08-05T09:00:00Z',
  ean = '8710000000001',
} = {}) {
  return {
    shipmentId,
    shipmentDateTime: shippedAt,
    order: { orderId, orderPlacedDateTime: placedAt },
    shipmentItems: [{ orderItemId: `${orderId}-ITEM-1`, ean, productTitle: `Warehouse item ${ean}`, quantity: 1 }],
  };
}

export function shipmentDetail({
  shipmentId,
  orderId,
  track,
  placedAt = '2026-08-05T08:00:00Z',
  shippedAt = '2026-08-05T09:00:00Z',
  ean = '8710000000001',
} = {}) {
  return {
    shipmentId,
    shipmentDateTime: shippedAt,
    order: { orderId, orderPlacedDateTime: placedAt },
    transport: { trackAndTrace: track, transporterCode: 'FIXTURE' },
    shipmentItems: [{ orderItemId: `${orderId}-ITEM-1`, ean, productTitle: `Warehouse item ${ean}`, quantity: 1 }],
  };
}

export function parcel({
  n = 1,
  orderId = `ORDER-${n}`,
  track = `TRACK-${n}`,
  placedAt,
  shippedAt,
  cancelled = false,
  verifierDelayMs = 0,
  verifierItems = null,
} = {}) {
  const shipmentId = `SHIPMENT-${n}`;
  const detail = shipmentDetail({ shipmentId, orderId, track, placedAt, shippedAt });
  return {
    summary: shipmentSummary({ shipmentId, orderId, placedAt, shippedAt }),
    detail,
    verifier: {
      cancelled,
      delayMs: verifierDelayMs,
      orderItems: verifierItems || detail.shipmentItems.map((item) => ({
        orderItemId: item.orderItemId,
        ean: item.ean,
        cancellationRequested: cancelled,
        quantityCancelled: cancelled ? 1 : 0,
      })),
    },
  };
}

export function snapshot({ orders = [], parcels = [], pageSize = 50 } = {}) {
  return {
    pageSize,
    orders,
    shipments: parcels.map((entry) => entry.summary),
    shipmentDetails: Object.fromEntries(parcels.map((entry) => [entry.summary.shipmentId, entry.detail])),
    orderDetails: Object.fromEntries(orders.map((entry) => [entry.orderId, entry])),
    verifiers: Object.fromEntries(parcels.map((entry) => [entry.detail.order.orderId, entry.verifier])),
  };
}

export function healthyScenario(overrides = {}) {
  const first = parcel();
  return {
    snapshots: [snapshot({ parcels: [first] })],
    activeSnapshot: 0,
    failures: [],
    delays: {},
    ...overrides,
  };
}

export function paginatedRecords(kind, count, factory) {
  return Array.from({ length: count }, (_, index) => factory(index + 1, kind));
}

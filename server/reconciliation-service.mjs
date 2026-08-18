import { createHash } from 'node:crypto';
import { UpstreamError, ValidationError } from './errors.mjs';
import { normalizeTrackingCode } from './security.mjs';
import { previousWorkday, scannerWorkday, workdayBounds } from './workday.mjs';

const MAX_PAGES = 100;
const STABLE_ATTEMPTS = 3;

function fingerprint(value) {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}

function isCancelled(item) {
  return item.cancellationRequested === true
    || item.cancellationRequest === true
    || Number(item.quantityCancelled || 0) > 0
    || String(item.fulfilmentStatus || '').toUpperCase() === 'CANCELLED';
}

function stableSignature(rows) {
  return fingerprint(rows
    .map((row) => `${row.shipmentId}\0${row.shipmentDateTime}\0${row.order?.orderId || ''}`)
    .sort()
    .join('\n'));
}

async function enumerateOnce(client, start, end) {
  const shipments = new Map();
  let previousTimestamp = Number.POSITIVE_INFINITY;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await client.getShipmentsPage(page);
    const rows = payload?.shipments;
    if (!Array.isArray(rows)) throw new UpstreamError();
    let crossedStart = false;
    for (const row of rows) {
      const timestamp = new Date(row?.shipmentDateTime).getTime();
      if (!Number.isFinite(timestamp) || timestamp > previousTimestamp) throw new UpstreamError();
      previousTimestamp = timestamp;
      if (timestamp < start.getTime()) crossedStart = true;
      if (timestamp < start.getTime() || timestamp >= end.getTime()) continue;
      const prior = shipments.get(row.shipmentId);
      if (prior && JSON.stringify(prior) !== JSON.stringify(row)) throw new UpstreamError();
      shipments.set(row.shipmentId, row);
    }
    if (rows.length === 0 || crossedStart) return [...shipments.values()];
  }
  throw new UpstreamError();
}

export async function stableShipmentWindow(client, start, end) {
  let prior = null;
  for (let attempt = 0; attempt < STABLE_ATTEMPTS; attempt += 1) {
    const rows = await enumerateOnce(client, start, end);
    const signature = stableSignature(rows);
    if (prior?.signature === signature) return rows;
    prior = { signature, rows };
  }
  throw new UpstreamError();
}

async function sourcePackages(source, start, end) {
  const listed = await stableShipmentWindow(source.client, start, end);
  const orderCache = new Map();
  const packages = new Map();
  for (const summary of listed) {
    const detail = await source.client.getShipment(summary.shipmentId);
    if (detail.shipmentId !== summary.shipmentId
      || detail.shipmentDateTime !== summary.shipmentDateTime
      || detail.order?.orderId !== summary.order?.orderId
      || !Array.isArray(detail.shipmentItems)
      || detail.shipmentItems.length === 0) {
      throw new UpstreamError();
    }
    let trackingCode;
    try { trackingCode = normalizeTrackingCode(detail.transport?.trackAndTrace || ''); }
    catch (error) {
      if (error instanceof ValidationError) throw new UpstreamError();
      throw error;
    }
    const shipmentItemIds = detail.shipmentItems.map((item) => item.orderItemId);
    if (shipmentItemIds.some((value) => typeof value !== 'string' || !value)
      || new Set(shipmentItemIds).size !== shipmentItemIds.length) {
      throw new UpstreamError();
    }
    const orderId = detail.order.orderId;
    let order = orderCache.get(orderId);
    if (!order) {
      order = await source.client.getOrder(orderId);
      if (order.orderId !== orderId || !Array.isArray(order.orderItems)) throw new UpstreamError();
      orderCache.set(orderId, order);
    }
    const orderItems = new Map(order.orderItems.map((item) => [item.orderItemId, item]));
    const items = shipmentItemIds.map((orderItemId) => {
      const item = orderItems.get(orderItemId);
      if (!item) throw new UpstreamError();
      return { orderItemId, cancelled: isCancelled(item) };
    });
    const shipmentDateTime = detail.shipmentDateTime;
    const shipment = {
      shipmentId: detail.shipmentId,
      orderId,
      shipmentDateTime,
      items,
      itemFingerprint: fingerprint(items
        .map((item) => `${item.orderItemId}:${item.cancelled ? 1 : 0}`)
        .sort()
        .join('|')),
    };
    const parcel = packages.get(trackingCode) || {
      accountKey: source.key,
      accountLabel: source.label,
      accountIncarnation: source.incarnation,
      trackingCode,
      sourceCreatedAt: shipmentDateTime,
      sourceWorkday: scannerWorkday(shipmentDateTime),
      shipments: [],
      cancelled: false,
    };
    if (shipmentDateTime < parcel.sourceCreatedAt) {
      parcel.sourceCreatedAt = shipmentDateTime;
      parcel.sourceWorkday = scannerWorkday(shipmentDateTime);
    }
    parcel.shipments.push(shipment);
    packages.set(trackingCode, parcel);
  }
  for (const parcel of packages.values()) {
    const allItems = parcel.shipments.flatMap((shipment) => shipment.items);
    if (allItems.length === 0) throw new UpstreamError();
    parcel.cancelled = allItems.every((item) => item.cancelled);
    parcel.shipments.sort((left, right) => left.shipmentDateTime.localeCompare(right.shipmentDateTime)
      || left.shipmentId.localeCompare(right.shipmentId));
  }
  return [...packages.values()].sort((left, right) => left.sourceCreatedAt.localeCompare(right.sourceCreatedAt)
    || left.trackingCode.localeCompare(right.trackingCode));
}

export class ReconciliationService {
  constructor({ repository, sourceProvider, now = () => new Date() }) {
    this.repository = repository;
    this.sourceProvider = sourceProvider;
    this.now = now;
  }

  async refresh({ requestId }) {
    const startedAt = this.now();
    const workday = scannerWorkday(startedAt);
    const closeWorkday = previousWorkday(workday);
    const start = workdayBounds(closeWorkday).start;
    const end = workdayBounds(workday).end;
    try {
      const accounts = await this.sourceProvider.listSources();
      if (!Array.isArray(accounts) || accounts.length === 0) throw new UpstreamError();
      const packages = [];
      for (const account of accounts) {
        const source = await this.sourceProvider.getSource(account.key);
        if (!source || source.incarnation !== account.incarnation || !source.client) throw new UpstreamError();
        packages.push(...await sourcePackages(source, start, end));
      }
      const completedAt = this.now();
      await this.repository.recordReconciliationSnapshot({
        runId: requestId,
        workday,
        closeWorkday,
        accounts,
        packages,
        startedAt,
        completedAt,
      });
      return { workday, accounts, packages: packages.length, completedAt: completedAt.toISOString() };
    } catch (error) {
      const completedAt = this.now();
      try {
        await this.repository.recordReconciliationFailure({
          runId: requestId,
          workday,
          startedAt,
          completedAt,
          failureCode: 'source_unavailable',
        });
      } catch {}
      if (error instanceof UpstreamError) throw error;
      throw new UpstreamError();
    }
  }
}

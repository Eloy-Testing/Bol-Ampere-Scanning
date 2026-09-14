import { UpstreamError, ValidationError } from './errors.mjs';
import { normalizeTrackingCode, validateIdentifier } from './security.mjs';
import { scannerWorkday } from './workday.mjs';

function isCancelled(item) {
  return item.cancellationRequested === true
    || item.cancellationRequest === true
    || Number(item.quantityCancelled || 0) > 0
    || String(item.fulfilmentStatus || '').toUpperCase() === 'CANCELLED';
}

function publicOutcome(attemptedOutcome, changed, record) {
  if (record.outcome === 'cancelled') return 'cancelled';
  if (record.outcome === 'accepted') {
    return attemptedOutcome === 'accepted' && changed ? 'success' : 'duplicate';
  }
  return record.outcome;
}

async function timed(phase, onTiming, task, detail = null) {
  const startedAt = performance.now();
  try {
    return await task();
  } finally {
    try { if (onTiming) onTiming(phase, performance.now() - startedAt, detail); }
    catch { /* Diagnostics cannot change a scan decision. */ }
  }
}

function bolTiming() {
  return { tokenMs: 0, tokenCalls: 0, httpMs: 0, retries: 0, rateLimited: 0 };
}

export class ScanService {
  constructor({ repository, bolClient, bolClientForAccount, bolSourceForAccount, now = () => new Date() }) {
    this.repository = repository;
    this.bolClient = bolClient;
    this.bolClientForAccount = bolClientForAccount || ((accountKey) => {
      if (accountKey && accountKey !== 'primary') throw new ValidationError();
      return bolClient;
    });
    this.bolSourceForAccount = bolSourceForAccount || (async (accountKey) => ({
      client: await this.bolClientForAccount(accountKey),
      incarnation: null,
    }));
    this.now = now;
  }

  async #persist({ trackingCode, shipmentId = null, orderId = null, sourceAccount = null, sourceAccountIncarnation = null, outcome, reason, session, requestId, onTiming }) {
    const currentTime = this.now();
    const result = await timed('turso', onTiming, () => this.repository.recordScanDecision({
      workday: scannerWorkday(currentTime),
      trackingCode,
      shipmentId,
      orderId,
      sourceAccount,
      sourceAccountIncarnation,
      outcome,
      reason,
      stationId: session.stationId,
      principalId: session.principalId,
      sessionTokenHash: session.tokenHash,
      requestId,
      now: currentTime,
    }));
    return {
      outcome: publicOutcome(outcome, result.changed, result.record),
      counted: outcome === 'accepted' && result.changed && result.record.outcome === 'accepted',
      reason: result.record.outcome === outcome ? reason : `already_${result.record.outcome}`,
      record: result.record,
      workday: result.record.workday,
      canonicalRecords: result.records,
    };
  }

  async decide({ trackingCode: rawTrackingCode, shipmentId: rawShipmentId, verificationIncomplete = false, account: sourceAccount = null, resolvedSource = null, session, requestId, onTiming }) {
    const trackingCode = normalizeTrackingCode(rawTrackingCode);
    if (rawShipmentId == null || rawShipmentId === '') {
      return this.#persist({
        trackingCode,
        sourceAccount: null,
        outcome: verificationIncomplete ? 'unverified' : 'unknown',
        reason: verificationIncomplete ? 'snapshot_refresh_failed' : 'not_in_complete_snapshot',
        session,
        requestId,
        onTiming,
      });
    }

    const shipmentId = validateIdentifier(rawShipmentId);
    if (resolvedSource && (resolvedSource.key !== (sourceAccount || 'primary') || !resolvedSource.client)) throw new ValidationError();
    let shipment;
    let orderId = null;
    try {
      const source = resolvedSource || await timed('source', onTiming, () => this.bolSourceForAccount(sourceAccount || 'primary'));
      const bolClient = source.client;
      const shipmentTiming = bolTiming();
      shipment = await timed('shipment', onTiming, () => bolClient.getShipment(shipmentId, { timing: shipmentTiming }), shipmentTiming);
      if (shipment.shipmentId !== shipmentId) throw new UpstreamError();
      const verifiedCode = normalizeTrackingCode(shipment.transport?.trackAndTrace || '');
      orderId = validateIdentifier(shipment.order?.orderId || '');
      if (verifiedCode !== trackingCode) throw new UpstreamError();

      const shipmentItemIds = new Set(
        (shipment.shipmentItems || []).map((item) => item.orderItemId).filter((value) => typeof value === 'string' && value),
      );
      if (shipmentItemIds.size === 0 || shipmentItemIds.size !== shipment.shipmentItems.length) throw new UpstreamError();

      const orderTiming = bolTiming();
      const order = await timed('order', onTiming, () => bolClient.getOrder(orderId, { timing: orderTiming }), orderTiming);
      if (order.orderId !== orderId || !Array.isArray(order.orderItems)) throw new UpstreamError();
      const relevantItems = order.orderItems.filter((item) => shipmentItemIds.has(item.orderItemId));
      if (relevantItems.length !== shipmentItemIds.size) throw new UpstreamError();

      if (relevantItems.some(isCancelled)) {
        return this.#persist({ trackingCode, shipmentId, orderId, sourceAccount, sourceAccountIncarnation: source.incarnation, outcome: 'cancelled', reason: 'order_item_cancelled', session, requestId, onTiming });
      }
      return this.#persist({ trackingCode, shipmentId, orderId, sourceAccount, sourceAccountIncarnation: source.incarnation, outcome: 'accepted', reason: 'verified_live', session, requestId, onTiming });
    } catch (error) {
      if (!(error instanceof UpstreamError) && !(error instanceof ValidationError)) throw error;
      return this.#persist({
        trackingCode,
        shipmentId,
        orderId,
        sourceAccount: null,
        outcome: 'unverified',
        reason: 'live_verification_failed',
        session,
        requestId,
        onTiming,
      });
    }
  }
}

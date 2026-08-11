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

export class ScanService {
  constructor({ repository, bolClient, bolClientForAccount, now = () => new Date() }) {
    this.repository = repository;
    this.bolClient = bolClient;
    this.bolClientForAccount = bolClientForAccount || ((accountKey) => {
      if (accountKey && accountKey !== 'primary') throw new ValidationError();
      return bolClient;
    });
    this.now = now;
  }

  async #persist({ trackingCode, shipmentId = null, orderId = null, sourceAccount = null, outcome, reason, session, requestId }) {
    const currentTime = this.now();
    const result = await this.repository.recordScanDecision({
      workday: scannerWorkday(currentTime),
      trackingCode,
      shipmentId,
      orderId,
      sourceAccount,
      outcome,
      reason,
      stationId: session.stationId,
      principalId: session.principalId,
      sessionTokenHash: session.tokenHash,
      requestId,
      now: currentTime,
    });
    return {
      outcome: publicOutcome(outcome, result.changed, result.record),
      counted: outcome === 'accepted' && result.changed && result.record.outcome === 'accepted',
      reason: result.record.outcome === outcome ? reason : `already_${result.record.outcome}`,
      record: result.record,
      workday: result.record.workday,
      canonicalRecords: result.records,
    };
  }

  async decide({ trackingCode: rawTrackingCode, shipmentId: rawShipmentId, verificationIncomplete = false, account: sourceAccount = null, session, requestId }) {
    const trackingCode = normalizeTrackingCode(rawTrackingCode);
    if (rawShipmentId == null || rawShipmentId === '') {
      return this.#persist({
        trackingCode,
        sourceAccount: null,
        outcome: verificationIncomplete ? 'unverified' : 'unknown',
        reason: verificationIncomplete ? 'snapshot_refresh_failed' : 'not_in_complete_snapshot',
        session,
        requestId,
      });
    }

    const shipmentId = validateIdentifier(rawShipmentId);
    let shipment;
    let orderId = null;
    try {
      const bolClient = this.bolClientForAccount(sourceAccount || 'primary');
      shipment = await bolClient.getShipment(shipmentId);
      if (shipment.shipmentId !== shipmentId) throw new UpstreamError();
      const verifiedCode = normalizeTrackingCode(shipment.transport?.trackAndTrace || '');
      orderId = validateIdentifier(shipment.order?.orderId || '');
      if (verifiedCode !== trackingCode) throw new UpstreamError();

      const shipmentItemIds = new Set(
        (shipment.shipmentItems || []).map((item) => item.orderItemId).filter((value) => typeof value === 'string' && value),
      );
      if (shipmentItemIds.size === 0 || shipmentItemIds.size !== shipment.shipmentItems.length) throw new UpstreamError();

      const order = await bolClient.getOrder(orderId);
      if (order.orderId !== orderId || !Array.isArray(order.orderItems)) throw new UpstreamError();
      const relevantItems = order.orderItems.filter((item) => shipmentItemIds.has(item.orderItemId));
      if (relevantItems.length !== shipmentItemIds.size) throw new UpstreamError();

      if (relevantItems.some(isCancelled)) {
        return this.#persist({ trackingCode, shipmentId, orderId, sourceAccount, outcome: 'cancelled', reason: 'order_item_cancelled', session, requestId });
      }
      return this.#persist({ trackingCode, shipmentId, orderId, sourceAccount, outcome: 'accepted', reason: 'verified_live', session, requestId });
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
      });
    }
  }
}

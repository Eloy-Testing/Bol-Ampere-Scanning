import { UpstreamError, ValidationError } from './errors.mjs';
import { validateIdentifier } from './security.mjs';

const TOKEN_URL = 'https://login.bol.com/token';
const API_BASE_URL = 'https://api.bol.com/retailer';
const ACCEPT = 'application/vnd.retailer.v10+json';
const USER_AGENT = 'Ampere-Warehouse-Scanner/1.0';
const PAGE_LIMIT = 100;

function text(value, maxLength = 256) {
  return typeof value === 'string' && value.length <= maxLength ? value : undefined;
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function requiredText(value, maxLength = 256) {
  const result = text(value, maxLength);
  if (!result || result.trim() !== result || result.length === 0) throw new UpstreamError();
  return result;
}

function requiredIdentifier(value, maxLength = 128) {
  try {
    return validateIdentifier(value, maxLength);
  } catch {
    throw new UpstreamError();
  }
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function sanitizeOrderItem(item) {
  if (!item || typeof item !== 'object') throw new UpstreamError();
  const quantityCancelled = finite(item.quantityCancelled);
  if (typeof item.cancellationRequest !== 'boolean' || quantityCancelled === undefined || quantityCancelled < 0) {
    throw new UpstreamError();
  }
  return compact({
    orderItemId: requiredIdentifier(item.orderItemId),
    ean: text(item.ean, 32),
    productTitle: text(item.productTitle, 512),
    quantity: finite(item.quantity),
    quantityShipped: finite(item.quantityShipped),
    quantityCancelled,
    cancellationRequest: item.cancellationRequest,
    fulfilmentStatus: text(item.fulfilmentStatus, 64),
    exactDeliveryDate: text(item.exactDeliveryDate, 32),
  });
}

function sanitizeShipmentItem(item) {
  if (!item || typeof item !== 'object') throw new UpstreamError();
  return compact({
    orderItemId: requiredIdentifier(item.orderItemId),
    ean: text(item.ean, 32),
    productTitle: text(item.productTitle, 512),
    quantity: finite(item.quantity),
  });
}

export function sanitizeOrder(order, { detail = false } = {}) {
  if (!order || typeof order !== 'object') throw new UpstreamError();
  const orderId = requiredIdentifier(order.orderId);
  const sanitized = compact({
    orderId,
    orderPlacedDateTime: text(order.orderPlacedDateTime, 64),
  });
  if (detail || Array.isArray(order.orderItems)) {
    if (!Array.isArray(order.orderItems) || order.orderItems.length === 0) throw new UpstreamError();
    sanitized.orderItems = order.orderItems.map(sanitizeOrderItem);
  }
  return sanitized;
}

export function sanitizeShipment(shipment, { detail = false } = {}) {
  if (!shipment || typeof shipment !== 'object') throw new UpstreamError();
  const shipmentId = requiredIdentifier(shipment.shipmentId);
  const orderId = shipment.order?.orderId == null ? undefined : requiredIdentifier(shipment.order.orderId);
  const sanitized = compact({
    shipmentId,
    shipmentDateTime: text(shipment.shipmentDateTime, 64),
    order: orderId ? compact({
      orderId,
      orderPlacedDateTime: text(shipment.order?.orderPlacedDateTime, 64),
    }) : undefined,
  });
  if (detail) {
    if (!orderId || !Array.isArray(shipment.shipmentItems) || shipment.shipmentItems.length === 0) throw new UpstreamError();
    if (!text(shipment.transport?.trackAndTrace, 256)) throw new UpstreamError();
    sanitized.shipmentItems = shipment.shipmentItems.map(sanitizeShipmentItem);
    sanitized.transport = compact({
      trackAndTrace: text(shipment.transport?.trackAndTrace, 256),
      transporterCode: text(shipment.transport?.transporterCode, 64),
    });
  } else if (Array.isArray(shipment.shipmentItems)) {
    sanitized.shipmentItems = shipment.shipmentItems.map(sanitizeShipmentItem);
  }
  return sanitized;
}

export class BolClient {
  constructor({
    clientId,
    clientSecret,
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    timeoutMs = 8_000,
    nodeEnv = 'production',
    tokenUrl,
    apiBaseUrl,
  }) {
    if (!clientId || !clientSecret || typeof fetchImpl !== 'function') throw new UpstreamError();
    if ((tokenUrl || apiBaseUrl) && nodeEnv !== 'test') throw new UpstreamError();
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.fetch = fetchImpl;
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.tokenUrl = tokenUrl || TOKEN_URL;
    this.apiBaseUrl = apiBaseUrl || API_BASE_URL;
    this.token = null;
  }

  async #boundedJson(url, options) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) return { response, payload: null };
      let payload;
      try { payload = await response.json(); } catch { throw new UpstreamError(); }
      return { response, payload };
    } catch {
      throw new UpstreamError();
    } finally {
      clearTimeout(timeout);
    }
  }

  async #accessToken(force = false) {
    if (!force && this.token && this.token.expiresAt - 30_000 > this.now()) return this.token.value;
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`, 'utf8').toString('base64');
    const { response, payload } = await this.#boundedJson(this.tokenUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: 'grant_type=client_credentials',
    });
    if (!response.ok) throw new UpstreamError();
    if (typeof payload?.access_token !== 'string' || payload.access_token.length < 8) throw new UpstreamError();
    const expiresIn = Math.min(600, Math.max(30, Number(payload.expires_in) || 299));
    this.token = { value: payload.access_token, expiresAt: this.now() + expiresIn * 1000 };
    return this.token.value;
  }

  async #request(path, retry = true) {
    const token = await this.#accessToken();
    const { response, payload } = await this.#boundedJson(`${this.apiBaseUrl}${path}`, {
      method: 'GET',
      headers: {
        Accept: ACCEPT,
        Authorization: `Bearer ${token}`,
        'User-Agent': USER_AGENT,
      },
    });
    if (response.status === 401 && retry) {
      this.token = null;
      await this.#accessToken(true);
      return this.#request(path, false);
    }
    if (!response.ok) throw new UpstreamError();
    return payload;
  }

  async getOrdersPage(page) {
    if (!Number.isInteger(page) || page < 1 || page > PAGE_LIMIT) throw new ValidationError();
    const payload = await this.#request(`/orders?page=${page}`);
    if (!Array.isArray(payload?.orders)) throw new UpstreamError();
    return compact({
      orders: payload.orders.map((order) => sanitizeOrder(order)),
      page,
      totalPages: finite(payload.totalPages),
      totalElements: finite(payload.totalElements),
    });
  }

  async getShipmentsPage(page) {
    if (!Number.isInteger(page) || page < 1 || page > PAGE_LIMIT) throw new ValidationError();
    const payload = await this.#request(`/shipments?page=${page}`);
    if (!Array.isArray(payload?.shipments)) throw new UpstreamError();
    return compact({
      shipments: payload.shipments.map((shipment) => sanitizeShipment(shipment)),
      page,
      totalPages: finite(payload.totalPages),
      totalElements: finite(payload.totalElements),
    });
  }

  async getOrder(id) {
    const identifier = validateIdentifier(id);
    return sanitizeOrder(await this.#request(`/orders/${encodeURIComponent(identifier)}`), { detail: true });
  }

  async getShipment(id) {
    const identifier = validateIdentifier(id);
    return sanitizeShipment(await this.#request(`/shipments/${encodeURIComponent(identifier)}`), { detail: true });
  }

  async #all(resource) {
    const records = [];
    for (let page = 1; page <= PAGE_LIMIT; page += 1) {
      const payload = resource === 'orders' ? await this.getOrdersPage(page) : await this.getShipmentsPage(page);
      const pageRecords = payload[resource];
      if (pageRecords.length === 0) return records;
      records.push(...pageRecords);
    }
    throw new UpstreamError();
  }

  getAllOrders() {
    return this.#all('orders');
  }

  getAllShipments() {
    return this.#all('shipments');
  }
}

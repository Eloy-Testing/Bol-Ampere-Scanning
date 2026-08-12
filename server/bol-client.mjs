import { UpstreamError, ValidationError } from './errors.mjs';
import { validateIdentifier } from './security.mjs';

const TOKEN_URL = 'https://login.bol.com/token';
const API_BASE_URL = 'https://api.bol.com/retailer';
const ACCEPT = 'application/vnd.retailer.v10+json';
const USER_AGENT = 'Ampere-Warehouse-Scanner/1.0';
const PAGE_LIMIT = 100;
const REQUEST_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [150, 400];
const MAX_RETRY_AFTER_MS = 2_000;
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/;

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

function isValidIsoInstant(value) {
  if (typeof value !== 'string') return false;
  const match = ISO_INSTANT.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText = '0', offsetMinuteText = '0'] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const daysInMonth = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12
    && day >= 1 && day <= daysInMonth[month - 1]
    && Number(hourText) <= 23
    && Number(minuteText) <= 59
    && Number(secondText) <= 59
    && Number(offsetHourText) <= 23
    && Number(offsetMinuteText) <= 59
    && Number.isFinite(new Date(value).getTime());
}

function requiredIso(value, maxLength = 64) {
  const result = requiredText(value, maxLength);
  if (!isValidIsoInstant(result)) throw new UpstreamError();
  return result;
}

function optionalIso(value, maxLength = 64) {
  if (value == null) return undefined;
  return requiredIso(value, maxLength);
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function retryableStatus(status) {
  return [408, 425, 429].includes(status) || status >= 500;
}

function retryDelay(response, attempt, now) {
  const raw = response?.headers?.get('retry-after');
  if (raw != null) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(MAX_RETRY_AFTER_MS, Math.round(seconds * 1_000));
    const timestamp = Date.parse(raw);
    if (Number.isFinite(timestamp)) return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, timestamp - now()));
  }
  return RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
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
    orderPlacedDateTime: requiredIso(order.orderPlacedDateTime),
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
    shipmentDateTime: requiredIso(shipment.shipmentDateTime),
    order: orderId ? compact({
      orderId,
      orderPlacedDateTime: optionalIso(shipment.order?.orderPlacedDateTime),
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
    sleepImpl = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  }) {
    if (!clientId || !clientSecret || typeof fetchImpl !== 'function' || typeof sleepImpl !== 'function') throw new UpstreamError();
    if ((tokenUrl || apiBaseUrl) && nodeEnv !== 'test') throw new UpstreamError();
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.fetch = fetchImpl;
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.tokenUrl = tokenUrl || TOKEN_URL;
    this.apiBaseUrl = apiBaseUrl || API_BASE_URL;
    this.sleep = sleepImpl;
    this.token = null;
  }

  async #boundedJson(url, options) {
    for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      let response;
      try {
        response = await this.fetch(url, { ...options, signal: controller.signal });
      } catch {
        if (attempt === REQUEST_ATTEMPTS) throw new UpstreamError();
        try { await this.sleep(retryDelay(null, attempt, this.now)); } catch { throw new UpstreamError(); }
        continue;
      } finally {
        clearTimeout(timeout);
      }
      if (response.ok) {
        let payload;
        try { payload = await response.json(); } catch { throw new UpstreamError(); }
        return { response, payload };
      }
      if (!retryableStatus(response.status) || attempt === REQUEST_ATTEMPTS) return { response, payload: null };
      try { await this.sleep(retryDelay(response, attempt, this.now)); } catch { throw new UpstreamError(); }
    }
    throw new UpstreamError();
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
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new UpstreamError();
    const orders = payload.orders == null ? [] : payload.orders;
    if (!Array.isArray(orders)) throw new UpstreamError();
    return compact({
      orders: orders.map((order) => sanitizeOrder(order)),
      page,
    });
  }

  async getShipmentsPage(page) {
    if (!Number.isInteger(page) || page < 1 || page > PAGE_LIMIT) throw new ValidationError();
    const payload = await this.#request(`/shipments?page=${page}`);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new UpstreamError();
    const shipments = payload.shipments == null ? [] : payload.shipments;
    if (!Array.isArray(shipments)) throw new UpstreamError();
    return compact({
      shipments: shipments.map((shipment) => sanitizeShipment(shipment)),
      page,
    });
  }

  async getOrder(id) {
    const identifier = validateIdentifier(id);
    const order = sanitizeOrder(await this.#request(`/orders/${encodeURIComponent(identifier)}`), { detail: true });
    if (order.orderId !== identifier) throw new UpstreamError();
    return order;
  }

  async getShipment(id) {
    const identifier = validateIdentifier(id);
    const shipment = sanitizeShipment(await this.#request(`/shipments/${encodeURIComponent(identifier)}`), { detail: true });
    if (shipment.shipmentId !== identifier) throw new UpstreamError();
    return shipment;
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

const ACCOUNT_KEY = /^(?:primary|secondary)$/;

export class BolClientPool {
  constructor({ accounts, clientFactory = (account) => new BolClient(account) }) {
    if (!Array.isArray(accounts) || accounts.length === 0 || typeof clientFactory !== 'function') throw new UpstreamError();
    this.clients = new Map();
    for (const account of accounts) {
      if (!account || !ACCOUNT_KEY.test(account.key) || this.clients.has(account.key)) throw new UpstreamError();
      const client = clientFactory(account);
      if (!client || typeof client.getOrdersPage !== 'function' || typeof client.getShipmentsPage !== 'function'
        || typeof client.getOrder !== 'function' || typeof client.getShipment !== 'function') throw new UpstreamError();
      this.clients.set(account.key, client);
    }
    if (!this.clients.has('primary')) throw new UpstreamError();
  }

  accountKeys() {
    return [...this.clients.keys()];
  }

  has(accountKey) {
    return typeof accountKey === 'string' && this.clients.has(accountKey);
  }

  get(accountKey) {
    const client = this.clients.get(accountKey);
    if (!client) throw new ValidationError();
    return client;
  }
}

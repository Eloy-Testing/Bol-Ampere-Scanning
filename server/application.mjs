import { randomUUID } from 'node:crypto';
import { BolClient } from './bol-client.mjs';
import { BolAccountService } from './bol-account-service.mjs';
import { loadConfig } from './config.mjs';
import { CredentialVault } from './credential-vault.mjs';
import { createDatabaseClient } from './database.mjs';
import { AppError, ValidationError, publicError } from './errors.mjs';
import { ScannerRepository } from './repository.mjs';
import { ScanService } from './scan-service.mjs';
import {
  clearSessionCookie,
  clearLogoutPendingCookie,
  enforceSameOrigin,
  hmac,
  logoutPendingCookie,
  normalizeTrackingCode,
  parseCookies,
  preferenceCookie,
  randomSessionToken,
  sessionCookie,
  signPreference,
  signSessionToken,
  sourceAddress,
  tokenHash,
  validateAuditLabel,
  validateIdentifier,
  verifyPassword,
  verifySignedPreference,
  verifySignedSessionToken,
} from './security.mjs';
import { scannerWorkday } from './workday.mjs';

const API_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, max-age=0',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Content-Type': 'application/json; charset=utf-8',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
});

function requestHeader(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [key, value] of Object.entries({ ...API_HEADERS, ...headers })) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const contentType = String(requestHeader(req, 'content-type') || '').toLowerCase();
  if (!contentType.startsWith('application/json')) throw new ValidationError();
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw) {
    for await (const chunk of req) {
      raw += chunk.toString('utf8');
      if (Buffer.byteLength(raw) > 8192) throw new ValidationError();
    }
  }
  if (!raw || Buffer.byteLength(raw) > 8192) throw new ValidationError();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new ValidationError(); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ValidationError();
  return parsed;
}

function exactKeys(object, required, optional = []) {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(object);
  if (required.some((key) => !Object.hasOwn(object, key)) || keys.some((key) => !allowed.has(key))) {
    throw new ValidationError();
  }
}

function statePayload(workday, records) {
  const scanned = {};
  const cancelled = [];
  const stops = [];
  for (const record of records) {
    if (record.outcome === 'accepted') scanned[record.trackingCode] = record.acceptedAt || record.updatedAt;
    else if (record.outcome === 'cancelled') {
      cancelled.push({ code: record.trackingCode, orderId: record.orderId || '', time: record.cancelledAt || record.updatedAt, sourceAccount: record.sourceAccount || null });
    } else {
      stops.push({ code: record.trackingCode, orderId: record.orderId || '', reason: record.outcome, time: record.updatedAt, sourceAccount: record.sourceAccount || null });
    }
  }
  return { workday, records, scanned, cancelled, stops };
}

export function createApplication({ config, repository, bolClient, bolAccountService, now = () => new Date(), requestId = () => randomUUID() }) {
  const legacyKeys = bolClient && typeof bolClient.accountKeys === 'function' ? bolClient.accountKeys() : ['primary'];
  const accounts = bolAccountService || Object.freeze({
    listAccounts: async () => legacyKeys.map((key) => ({
      key,
      label: key === 'primary' ? 'Bankhoes' : key === 'secondary' ? 'Muisstil' : key,
      kind: ['primary', 'secondary'].includes(key) ? 'internal' : 'client',
      lastVerifiedAt: null,
    })),
    get: async (accountKey) => {
      if (bolClient && typeof bolClient.get === 'function') return bolClient.get(accountKey);
      if (accountKey !== 'primary') throw new ValidationError();
      return bolClient;
    },
  });
  const scanService = new ScanService({ repository, bolClientForAccount: (accountKey) => accounts.get(accountKey), now });

  function requestCookies(req) {
    return parseCookies(requestHeader(req, 'cookie'));
  }

  async function authenticate(req, id, { allowLogoutPending = false } = {}) {
    const cookies = requestCookies(req);
    if (!allowLogoutPending && cookies.ampere_logout_pending === '1') return null;
    const signed = cookies.ampere_session;
    const token = verifySignedSessionToken(signed, config.sessionSecret);
    if (!token) return null;
    return repository.getSession(tokenHash(token), now(), id);
  }

  function rememberedPreference(req) {
    return verifySignedPreference(requestCookies(req).ampere_preference, config.sessionSecret, now());
  }

  async function sessionRoute(req, res) {
    if (req.method === 'GET') {
      const remembered = rememberedPreference(req);
      if (requestCookies(req).ampere_logout_pending === '1') {
        return sendJson(res, 200, {
          authenticated: false,
          logoutPending: true,
          ...(remembered ? { remembered } : {}),
        });
      }
      const id = requestId();
      const session = await authenticate(req, id);
      if (!session) return sendJson(res, 200, { authenticated: false, ...(remembered ? { remembered } : {}) });
      return sendJson(res, 200, {
        authenticated: true,
        session: { stationId: session.stationId, operatorLabel: session.operatorLabel, expiresAt: session.expiresAt },
      });
    }

    if (req.method === 'POST') {
      enforceSameOrigin(req);
      if (requestCookies(req).ampere_logout_pending === '1') {
        throw new AppError('logout_pending', 409, 'Sign-out must be retried.');
      }
      const body = await readJson(req);
      exactKeys(body, ['stationId', 'operatorLabel', 'password']);
      const stationId = validateAuditLabel(body.stationId, 64);
      const operatorLabel = validateAuditLabel(body.operatorLabel, 64);
      if (typeof body.password !== 'string' || body.password.length > 1024) throw new ValidationError();
      const id = requestId();
      const sourceKey = hmac(config.sessionSecret, 'source-address', sourceAddress(req));
      const lockout = await repository.getLockout(sourceKey, now());
      const authAudit = { stationLabel: stationId, operatorLabel, requestId: id };
      if (lockout) {
        throw new AppError('locked', 423, 'Access is temporarily locked.');
      }

      if (!await verifyPassword(body.password, config.passwordHash)) {
        const failure = await repository.recordAuthFailure(sourceKey, now(), {
          windowSeconds: config.authWindowSeconds,
          lockSeconds: config.authLockSeconds,
          failureLimit: config.authFailureLimit,
        }, authAudit);
        if (failure.lockedUntil && failure.lockedUntil > now().toISOString()) {
          throw new AppError('locked', 423, 'Access is temporarily locked.');
        }
        throw new AppError('invalid_credentials', 401, 'Access denied.');
      }

      await repository.clearAuthFailures(sourceKey, now(), authAudit);
      const token = randomSessionToken();
      const digest = tokenHash(token);
      const currentTime = now();
      const expiresAt = new Date(currentTime.getTime() + config.sessionTtlSeconds * 1000);
      const preferenceExpiresAt = new Date(currentTime.getTime() + config.preferenceTtlSeconds * 1000);
      const principalId = `operator-${hmac(config.sessionSecret, 'operator-label', operatorLabel.toLocaleLowerCase('en')).slice(0, 24)}`;
      await repository.createSession({
        tokenHash: digest,
        stationId,
        operatorLabel,
        principalId,
        sourceKey,
        requestId: id,
        now: currentTime,
        expiresAt,
      });
      return sendJson(res, 200, {
        authenticated: true,
        session: { stationId, operatorLabel, expiresAt: expiresAt.toISOString() },
      }, {
        'Set-Cookie': [
          sessionCookie(signSessionToken(token, config.sessionSecret), {
            maxAge: config.sessionTtlSeconds,
            secure: config.secureCookies,
          }),
          preferenceCookie(signPreference({ stationId, operatorLabel }, config.sessionSecret, preferenceExpiresAt), {
            maxAge: config.preferenceTtlSeconds,
            secure: config.secureCookies,
          }),
          clearLogoutPendingCookie({ secure: config.secureCookies }),
        ],
      });
    }

    if (req.method === 'DELETE') {
      enforceSameOrigin(req);
      const id = requestId();
      try {
        const session = await authenticate(req, id, { allowLogoutPending: true });
        if (session) await repository.revokeSession(session, id, now());
        return sendJson(res, 200, { authenticated: false }, {
          'Set-Cookie': [
            clearSessionCookie({ secure: config.secureCookies }),
            clearLogoutPendingCookie({ secure: config.secureCookies }),
          ],
        });
      } catch (error) {
        const failure = publicError(error);
        return sendJson(res, failure.status, failure.body, {
          'Set-Cookie': logoutPendingCookie({ maxAge: config.sessionTtlSeconds, secure: config.secureCookies }),
        });
      }
    }

    return sendJson(res, 405, { error: { code: 'method_not_allowed', message: 'Method not allowed.' } }, { Allow: 'GET, POST, DELETE' });
  }

  async function requireSession(req, id) {
    const session = await authenticate(req, id);
    if (!session) throw new AppError('unauthorized', 401, 'Authentication required.');
    return session;
  }

  async function stateRoute(req, res) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: { code: 'method_not_allowed', message: 'Method not allowed.' } }, { Allow: 'GET' });
    const id = requestId();
    await requireSession(req, id);
    const workday = scannerWorkday(now());
    const records = await repository.getWorkdayState(workday);
    return sendJson(res, 200, statePayload(workday, records));
  }

  async function retailerRoute(req, res) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: { code: 'method_not_allowed', message: 'Method not allowed.' } }, { Allow: 'GET' });
    const id = requestId();
    await requireSession(req, id);
    const url = new URL(req.url, 'http://localhost');
    const allowed = new Set(['resource', 'page', 'id', 'account']);
    if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) throw new ValidationError();
    const resource = url.searchParams.get('resource');
    if (!['accounts', 'orders', 'shipments', 'order', 'shipment'].includes(resource) || url.searchParams.getAll('resource').length !== 1) throw new ValidationError();
    if (resource === 'accounts') {
      if (url.searchParams.has('page') || url.searchParams.has('id') || url.searchParams.has('account')) throw new ValidationError();
      return sendJson(res, 200, { accounts: await accounts.listAccounts() });
    }
    const accountKey = url.searchParams.get('account');
    if (typeof accountKey !== 'string' || url.searchParams.getAll('account').length !== 1) throw new ValidationError();
    const client = await accounts.get(accountKey);
    const identifier = url.searchParams.get('id');
    const detailResource = resource === 'order' || resource === 'shipment';
    if (identifier != null || detailResource) {
      if (identifier == null) throw new ValidationError();
      if (url.searchParams.has('page') || url.searchParams.getAll('id').length !== 1) throw new ValidationError();
      const validId = validateIdentifier(identifier);
      const detail = resource === 'orders' || resource === 'order'
        ? await client.getOrder(validId)
        : await client.getShipment(validId);
      return sendJson(res, 200, detail);
    }
    const rawPage = url.searchParams.get('page') || '1';
    if (!/^\d{1,3}$/.test(rawPage) || url.searchParams.getAll('page').length > 1) throw new ValidationError();
    const page = Number(rawPage);
    const payload = resource === 'orders' ? await client.getOrdersPage(page) : await client.getShipmentsPage(page);
    return sendJson(res, 200, payload);
  }

  async function integrationsRoute(req, res) {
    const id = requestId();
    if (req.method === 'GET') {
      await requireSession(req, id);
      return sendJson(res, 200, { accounts: await accounts.listAccounts() });
    }
    if (!['POST', 'PUT'].includes(req.method)) {
      return sendJson(res, 405, { error: { code: 'method_not_allowed', message: 'Method not allowed.' } }, { Allow: 'GET, POST, PUT' });
    }
    enforceSameOrigin(req);
    const session = await requireSession(req, id);
    const body = await readJson(req);
    if (req.method === 'POST') exactKeys(body, ['accountName', 'clientId', 'clientSecret', 'password']);
    else exactKeys(body, ['accountKey', 'clientId', 'clientSecret', 'password']);
    if (typeof body.password !== 'string' || body.password.length > 1024) throw new ValidationError();
    if (!await verifyPassword(body.password, config.passwordHash)) {
      throw new AppError('management_reauth_failed', 403, 'Warehouse password not accepted.');
    }
    if (!accounts || typeof accounts.connect !== 'function') throw new AppError('credential_store_unavailable', 503, 'The connection could not be saved.');
    const account = await accounts.connect({
      accountKey: req.method === 'PUT' ? body.accountKey : null,
      label: req.method === 'POST' ? body.accountName : null,
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      session,
      requestId: id,
      now: now(),
    });
    return sendJson(res, req.method === 'POST' ? 201 : 200, { account });
  }

  async function scanRoute(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: { code: 'method_not_allowed', message: 'Method not allowed.' } }, { Allow: 'POST' });
    enforceSameOrigin(req);
    const id = requestId();
    const session = await requireSession(req, id);
    const body = await readJson(req);
    exactKeys(body, ['trackingCode'], ['shipmentId', 'verificationIncomplete', 'account']);
    normalizeTrackingCode(body.trackingCode);
    const hasShipmentId = body.shipmentId != null && body.shipmentId !== '';
    if (hasShipmentId) {
      validateIdentifier(body.shipmentId);
      if (typeof body.account !== 'string') throw new ValidationError();
      await accounts.get(body.account);
    } else if (body.account !== undefined) {
      throw new ValidationError();
    }
    if (body.verificationIncomplete !== undefined && body.verificationIncomplete !== true) throw new ValidationError();
    const decision = await scanService.decide({ ...body, session, requestId: id });
    const { canonicalRecords, workday, record, ...publicDecision } = decision;
    return sendJson(res, 200, {
      ...publicDecision,
      orderId: record.orderId || '',
      record,
      state: statePayload(workday, canonicalRecords),
    });
  }

  function safe(route) {
    return async (req, res) => {
      try {
        return await route(req, res);
      } catch (error) {
        const failure = publicError(error);
        return sendJson(res, failure.status, failure.body);
      }
    };
  }

  return Object.freeze({
    session: safe(sessionRoute),
    state: safe(stateRoute),
    retailer: safe(retailerRoute),
    integrations: safe(integrationsRoute),
    scan: safe(scanRoute),
  });
}

let defaultApplication;

export function getDefaultApplication() {
  if (defaultApplication) return defaultApplication;
  const config = loadConfig();
  const client = createDatabaseClient({ url: config.databaseUrl, authToken: config.databaseToken });
  const repository = new ScannerRepository(client);
  const vault = new CredentialVault(config.bolCredentialEncryptionKey);
  const bolAccountService = new BolAccountService({
    repository,
    staticAccounts: config.bolAccounts,
    vault,
    nodeEnv: config.nodeEnv,
    clientFactory: (credentials) => new BolClient({ ...credentials, nodeEnv: config.nodeEnv }),
  });
  defaultApplication = createApplication({ config, repository, bolAccountService });
  return defaultApplication;
}

export async function handleDefaultRoute(name, req, res) {
  try {
    const application = getDefaultApplication();
    return await application[name](req, res);
  } catch (error) {
    const failure = publicError(error);
    return sendJson(res, failure.status, failure.body);
  }
}

export function createWebRoute(application, name) {
  if (!application || typeof application[name] !== 'function') throw new Error('Unknown application route.');
  return async function webRoute(request) {
    const url = new URL(request.url);
    const headers = Object.fromEntries(request.headers.entries());
    if (!headers.host) headers.host = url.host;
    if (!headers['x-forwarded-proto']) headers['x-forwarded-proto'] = url.protocol.slice(0, -1);
    const method = String(request.method || 'GET').toUpperCase();
    const body = ['GET', 'HEAD'].includes(method) ? '' : await request.text();
    const req = {
      method,
      url: `${url.pathname}${url.search}`,
      headers,
      body,
      socket: { encrypted: url.protocol === 'https:', remoteAddress: headers['x-forwarded-for'] || 'unknown' },
      async *[Symbol.asyncIterator]() {},
    };
    const responseHeaders = new Map();
    let responseBody = '';
    const res = {
      statusCode: 200,
      setHeader(key, value) { responseHeaders.set(String(key), value); },
      end(value = '') { responseBody = value == null ? '' : String(value); },
    };
    await application[name](req, res);
    const webHeaders = new Headers();
    for (const [key, value] of responseHeaders) {
      if (Array.isArray(value)) value.forEach((item) => webHeaders.append(key, String(item)));
      else webHeaders.set(key, String(value));
    }
    return new Response(responseBody, { status: res.statusCode, headers: webHeaders });
  };
}

export function handleDefaultWebRoute(name, request) {
  return createWebRoute(getDefaultApplication(), name)(request);
}

export { statePayload };

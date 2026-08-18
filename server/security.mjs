import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { AppError, ValidationError } from './errors.mjs';

const scrypt = promisify(scryptCallback);
const HASH_PREFIX = 'scrypt-v1';
const PREFERENCE_PREFIX = 'preference-v1';
const SCRYPT_OPTIONS = Object.freeze({ N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

function decodeBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid encoding');
  return Buffer.from(value, 'base64url');
}

export async function hashPassword(password, salt = randomBytes(16)) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
    throw new ValidationError();
  }
  const derived = await scrypt(password, salt, 32, SCRYPT_OPTIONS);
  return `${HASH_PREFIX}$N=${SCRYPT_OPTIONS.N},r=${SCRYPT_OPTIONS.r},p=${SCRYPT_OPTIONS.p}$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

export function isPasswordHash(value) {
  try {
    const [prefix, parameters, saltValue, expectedValue, extra] = String(value || '').split('$');
    if (extra !== undefined || prefix !== HASH_PREFIX || parameters !== 'N=16384,r=8,p=1') return false;
    return decodeBase64Url(saltValue).length >= 16 && decodeBase64Url(expectedValue).length === 32;
  } catch {
    return false;
  }
}

export async function verifyPassword(password, encodedHash) {
  try {
    if (typeof password !== 'string' || password.length > 1024 || typeof encodedHash !== 'string') return false;
    if (!isPasswordHash(encodedHash)) return false;
    const [prefix, parameters, saltValue, expectedValue, extra] = encodedHash.split('$');
    if (extra !== undefined || prefix !== HASH_PREFIX || parameters !== 'N=16384,r=8,p=1') return false;
    const salt = decodeBase64Url(saltValue);
    const expected = decodeBase64Url(expectedValue);
    const actual = Buffer.from(await scrypt(password, salt, expected.length, SCRYPT_OPTIONS));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function randomSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hmac(secret, purpose, value) {
  return createHmac('sha256', secret).update(`${purpose}\0${value}`).digest('base64url');
}

export function tokenHash(token) {
  return createHash('sha256').update(token).digest('base64url');
}

export function signSessionToken(token, secret) {
  return `${token}.${hmac(secret, 'session-signature', token)}`;
}

export function verifySignedSessionToken(value, secret) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/);
  if (!match) return null;
  const expected = Buffer.from(hmac(secret, 'session-signature', match[1]), 'base64url');
  const actual = Buffer.from(match[2], 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return match[1];
}

export function signPreference({ stationId, operatorLabel }, secret, expiresAt) {
  const preference = {
    stationId: validateAuditLabel(stationId, 64),
    operatorLabel: validateAuditLabel(operatorLabel, 64),
  };
  const expiry = Math.floor(new Date(expiresAt).getTime() / 1000);
  if (!Number.isSafeInteger(expiry) || expiry <= 0) throw new ValidationError();
  const payload = Buffer.from(JSON.stringify(preference), 'utf8').toString('base64url');
  const signed = `${PREFERENCE_PREFIX}.${expiry}.${payload}`;
  return `${signed}.${hmac(secret, 'preference-signature', signed)}`;
}

export function verifySignedPreference(value, secret, now = new Date()) {
  try {
    if (typeof value !== 'string') return null;
    const match = value.match(/^preference-v1\.([1-9]\d*)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/);
    if (!match) return null;
    const signed = `${PREFERENCE_PREFIX}.${match[1]}.${match[2]}`;
    const expected = Buffer.from(hmac(secret, 'preference-signature', signed), 'base64url');
    const actual = Buffer.from(match[3], 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const expiry = Number(match[1]);
    const currentTime = new Date(now).getTime();
    if (!Number.isSafeInteger(expiry) || !Number.isFinite(currentTime) || expiry * 1000 <= currentTime) return null;
    const parsed = JSON.parse(Buffer.from(match[2], 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (Object.keys(parsed).length !== 2 || !Object.hasOwn(parsed, 'stationId') || !Object.hasOwn(parsed, 'operatorLabel')) return null;
    return {
      stationId: validateAuditLabel(parsed.stationId, 64),
      operatorLabel: validateAuditLabel(parsed.operatorLabel, 64),
    };
  } catch {
    return null;
  }
}

export function parseCookies(header) {
  const cookies = {};
  if (typeof header !== 'string') return cookies;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key || Object.hasOwn(cookies, key)) continue;
    try { cookies[key] = decodeURIComponent(value); } catch { /* Ignore malformed cookies. */ }
  }
  return cookies;
}

export function sessionCookie(value, { maxAge, secure }) {
  const parts = [
    `ampere_session=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie({ secure }) {
  return sessionCookie('', { maxAge: 0, secure });
}

export function preferenceCookie(value, { maxAge, secure }) {
  const parts = [
    `ampere_preference=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function logoutPendingCookie({ maxAge, secure }) {
  const parts = [
    'ampere_logout_pending=1',
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearLogoutPendingCookie({ secure }) {
  const parts = ['ampere_logout_pending=', 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function header(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function enforceSameOrigin(req) {
  const origin = header(req, 'origin');
  const fetchSite = header(req, 'sec-fetch-site');
  const forwardedHost = header(req, 'x-forwarded-host');
  const host = String(forwardedHost || header(req, 'host') || '').split(',')[0].trim();
  const forwardedProto = String(header(req, 'x-forwarded-proto') || '').split(',')[0].trim();
  const protocol = forwardedProto || (req.socket?.encrypted ? 'https' : 'http');
  if (!origin || !host || origin !== `${protocol}://${host}`) {
    throw new AppError('forbidden', 403, 'Request denied.');
  }
  if (fetchSite && fetchSite !== 'same-origin') {
    throw new AppError('forbidden', 403, 'Request denied.');
  }
}

export function sourceAddress(req) {
  const forwarded = String(header(req, 'x-forwarded-for') || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

export function validateAuditLabel(value, maxLength = 64) {
  if (typeof value !== 'string') throw new ValidationError();
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > maxLength || !/^[\p{L}\p{N} ._-]+$/u.test(normalized)) {
    throw new ValidationError();
  }
  return normalized;
}

export function validateIdentifier(value, maxLength = 128) {
  if (typeof value !== 'string') throw new ValidationError();
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || !/^[A-Za-z0-9._:/-]+$/.test(normalized)) {
    throw new ValidationError();
  }
  return normalized;
}

export function normalizeTrackingCode(value) {
  if (typeof value !== 'string') throw new ValidationError();
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized.length > 256 || !/^[A-Z0-9._:/+ -]+$/.test(normalized)) {
    throw new ValidationError();
  }
  return normalized;
}

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { ConfigurationError, CredentialStoreError, ValidationError } from './errors.mjs';

const FORMAT_VERSION = 1;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ACCOUNT_KEY = /^(?:primary|secondary|acct_[A-Za-z0-9_-]{22})$/;
const CLIENT_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function canonicalBase64Url(value, length) {
  if (typeof value !== 'string' || !BASE64URL.test(value)) throw new CredentialStoreError();
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== length || decoded.toString('base64url') !== value) throw new CredentialStoreError();
  return decoded;
}

export function parseCredentialEncryptionKey(value) {
  try {
    if (typeof value !== 'string' || !BASE64URL.test(value)) throw new Error('invalid');
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.length !== KEY_BYTES || decoded.toString('base64url') !== value) throw new Error('invalid');
    return decoded;
  } catch {
    throw new ConfigurationError();
  }
}

export function validateBolAccountKey(value) {
  if (typeof value !== 'string' || !ACCOUNT_KEY.test(value)) throw new ValidationError();
  return value;
}

export function validateBolAccountLabel(value) {
  if (typeof value !== 'string') throw new ValidationError();
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 64 || !/^[\p{L}\p{N} .&'()_-]+$/u.test(normalized)) throw new ValidationError();
  return normalized;
}

export function validateBolCredentials({ clientId, clientSecret }) {
  if (typeof clientId !== 'string' || clientId.trim() !== clientId || !CLIENT_ID.test(clientId)) throw new ValidationError();
  if (typeof clientSecret !== 'string' || clientSecret.length < 8 || clientSecret.length > 512 || /[\u0000-\u001f\u007f]/u.test(clientSecret)) {
    throw new ValidationError();
  }
  return { clientId, clientSecret };
}

function aad(accountKey) {
  return Buffer.from(`ampere-bol-credentials:v${FORMAT_VERSION}:${validateBolAccountKey(accountKey)}`, 'utf8');
}

export class CredentialVault {
  constructor(encryptionKey) {
    this.key = parseCredentialEncryptionKey(encryptionKey);
  }

  fingerprint(clientId) {
    const credentials = validateBolCredentials({ clientId, clientSecret: 'fingerprint-placeholder' });
    return createHmac('sha256', this.key)
      .update(`ampere-bol-client-id\0${credentials.clientId.toLocaleLowerCase('en-US')}`, 'utf8')
      .digest('base64url');
  }

  seal(accountKey, credentials) {
    const key = validateBolAccountKey(accountKey);
    const valid = validateBolCredentials(credentials);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(aad(key));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(valid), 'utf8'),
      cipher.final(),
    ]);
    return Object.freeze({
      envelopeVersion: FORMAT_VERSION,
      credentialCiphertext: ciphertext.toString('base64url'),
      credentialIv: iv.toString('base64url'),
      credentialTag: cipher.getAuthTag().toString('base64url'),
      credentialFingerprint: this.fingerprint(valid.clientId),
    });
  }

  open(accountKey, envelope) {
    try {
      const key = validateBolAccountKey(accountKey);
      if (Number(envelope?.envelopeVersion) !== FORMAT_VERSION) throw new Error('invalid');
      const iv = canonicalBase64Url(envelope.credentialIv, IV_BYTES);
      const tag = canonicalBase64Url(envelope.credentialTag, TAG_BYTES);
      if (typeof envelope.credentialCiphertext !== 'string' || !BASE64URL.test(envelope.credentialCiphertext)) throw new Error('invalid');
      const ciphertext = Buffer.from(envelope.credentialCiphertext, 'base64url');
      if (!ciphertext.length || ciphertext.toString('base64url') !== envelope.credentialCiphertext) throw new Error('invalid');
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAAD(aad(key));
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      const parsed = JSON.parse(plaintext);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).sort().join(',') !== 'clientId,clientSecret') {
        throw new Error('invalid');
      }
      return validateBolCredentials(parsed);
    } catch (error) {
      if (error instanceof ConfigurationError) throw error;
      throw new CredentialStoreError();
    }
  }
}

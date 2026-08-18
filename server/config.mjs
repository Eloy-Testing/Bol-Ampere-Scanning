import { ConfigurationError } from './errors.mjs';
import { parseCredentialEncryptionKey, validateBolCredentials } from './credential-vault.mjs';
import { isPasswordHash } from './security.mjs';

const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
export const APPROVED_TURSO_HOST = 'bankhoes-bi-data-zanderbmc.aws-eu-west-1.turso.io';

export function isApprovedDatabaseUrl(value) {
  if (!nonEmpty(value)) return false;
  if (value.startsWith('file:')) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'libsql:' && parsed.hostname === APPROVED_TURSO_HOST;
  } catch {
    return false;
  }
}

export function loadConfig(env = process.env) {
  const databaseUrl = env.TURSO_DATABASE_URL;
  const isLocalDatabase = nonEmpty(databaseUrl) && databaseUrl.startsWith('file:');
  const databaseToken = env.TURSO_AUTH_TOKEN || undefined;
  const sessionSecret = env.SESSION_SECRET;

  if (!isApprovedDatabaseUrl(databaseUrl) || (!isLocalDatabase && !nonEmpty(databaseToken))) {
    throw new ConfigurationError();
  }
  if (!nonEmpty(sessionSecret) || Buffer.byteLength(sessionSecret) < 32) {
    throw new ConfigurationError();
  }
  if (!isPasswordHash(env.WAREHOUSE_PASSWORD_HASH)) throw new ConfigurationError();
  try {
    validateBolCredentials({ clientId: env.BOL_CLIENT_ID, clientSecret: env.BOL_CLIENT_SECRET });
  } catch {
    throw new ConfigurationError();
  }
  parseCredentialEncryptionKey(env.BOL_CREDENTIAL_ENCRYPTION_KEY);
  const hasSecondaryClientId = nonEmpty(env.BOL_SECONDARY_CLIENT_ID);
  const hasSecondaryClientSecret = nonEmpty(env.BOL_SECONDARY_CLIENT_SECRET);
  if (hasSecondaryClientId !== hasSecondaryClientSecret) throw new ConfigurationError();
  if (hasSecondaryClientId) {
    try {
      validateBolCredentials({ clientId: env.BOL_SECONDARY_CLIENT_ID, clientSecret: env.BOL_SECONDARY_CLIENT_SECRET });
    } catch {
      throw new ConfigurationError();
    }
  }
  const bolAccounts = [Object.freeze({
    key: 'primary',
    label: 'Bankhoes',
    clientId: env.BOL_CLIENT_ID,
    clientSecret: env.BOL_CLIENT_SECRET,
  })];
  if (hasSecondaryClientId) {
    bolAccounts.push(Object.freeze({
      key: 'secondary',
      label: 'Muisstil',
      clientId: env.BOL_SECONDARY_CLIENT_ID,
      clientSecret: env.BOL_SECONDARY_CLIENT_SECRET,
    }));
  }

  return Object.freeze({
    databaseUrl,
    databaseToken,
    sessionSecret,
    passwordHash: env.WAREHOUSE_PASSWORD_HASH,
    bolClientId: env.BOL_CLIENT_ID,
    bolClientSecret: env.BOL_CLIENT_SECRET,
    bolAccounts: Object.freeze(bolAccounts),
    bolCredentialEncryptionKey: env.BOL_CREDENTIAL_ENCRYPTION_KEY,
    nodeEnv: env.NODE_ENV || 'production',
    secureCookies: (env.NODE_ENV || 'production') !== 'test',
    sessionTtlSeconds: 8 * 60 * 60,
    preferenceTtlSeconds: 90 * 24 * 60 * 60,
    authWindowSeconds: 15 * 60,
    authLockSeconds: 15 * 60,
    authFailureLimit: 5,
  });
}

export function databaseConfig(env = process.env) {
  const url = env.TURSO_DATABASE_URL;
  const authToken = env.TURSO_AUTH_TOKEN || undefined;
  if (!isApprovedDatabaseUrl(url) || (!url.startsWith('file:') && !nonEmpty(authToken))) {
    throw new ConfigurationError();
  }
  return { url, authToken };
}

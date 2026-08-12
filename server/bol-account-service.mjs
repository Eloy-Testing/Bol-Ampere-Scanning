import { randomBytes } from 'node:crypto';
import { BolClient } from './bol-client.mjs';
import {
  AccountLimitError,
  CredentialStoreError,
  DuplicateAccountError,
  ValidationError,
} from './errors.mjs';
import {
  validateBolAccountKey,
  validateBolAccountLabel,
  validateBolCredentials,
} from './credential-vault.mjs';

const MAX_ACCOUNTS = 20;

function generatedAccountKey() {
  return `acct_${randomBytes(16).toString('base64url')}`;
}

function publicAccount({ key, label, kind, lastVerifiedAt }) {
  return Object.freeze({
    key,
    label,
    kind,
    lastVerifiedAt: lastVerifiedAt || null,
  });
}

export class BolAccountService {
  constructor({
    repository,
    staticAccounts,
    vault,
    nodeEnv = 'production',
    clientFactory = (credentials) => new BolClient({ ...credentials, nodeEnv }),
    maxAccounts = MAX_ACCOUNTS,
  }) {
    if (!repository || !vault || !Array.isArray(staticAccounts) || typeof clientFactory !== 'function') throw new CredentialStoreError();
    if (!Number.isInteger(maxAccounts) || maxAccounts < 2 || maxAccounts > 100) throw new CredentialStoreError();
    this.repository = repository;
    this.vault = vault;
    this.clientFactory = clientFactory;
    this.maxAccounts = maxAccounts;
    this.staticAccounts = new Map();
    for (const account of staticAccounts) {
      const key = validateBolAccountKey(account?.key);
      if (!['primary', 'secondary'].includes(key) || this.staticAccounts.has(key)) throw new CredentialStoreError();
      const label = validateBolAccountLabel(account.label);
      const credentials = validateBolCredentials(account);
      this.staticAccounts.set(key, Object.freeze({ key, label, ...credentials }));
    }
    if (!this.staticAccounts.has('primary')) throw new CredentialStoreError();
    this.cache = new Map();
  }

  async #records() {
    const records = await this.repository.listBolAccountRecords();
    if (!Array.isArray(records)) throw new CredentialStoreError();
    return records;
  }

  #validateRecord(record) {
    const key = validateBolAccountKey(record?.accountKey);
    const label = validateBolAccountLabel(record.label);
    const expectedKind = ['primary', 'secondary'].includes(key) ? 'internal' : 'client';
    if (record.accountKind !== expectedKind || !Number.isInteger(record.revision) || record.revision < 1 || record.active !== true) {
      throw new CredentialStoreError();
    }
    return { ...record, accountKey: key, label, accountKind: expectedKind };
  }

  async listAccounts() {
    const records = (await this.#records()).map((record) => this.#validateRecord(record));
    const recordsByKey = new Map(records.map((record) => [record.accountKey, record]));
    const result = [];
    for (const key of ['primary', 'secondary']) {
      const staticAccount = this.staticAccounts.get(key);
      const managed = recordsByKey.get(key);
      if (!staticAccount && !managed) continue;
      result.push(publicAccount({
        key,
        label: staticAccount?.label || managed.label,
        kind: 'internal',
        lastVerifiedAt: managed?.lastVerifiedAt || null,
      }));
      recordsByKey.delete(key);
    }
    const dynamic = [...recordsByKey.values()]
      .sort((left, right) => left.label.localeCompare(right.label, 'en', { sensitivity: 'base' }) || left.accountKey.localeCompare(right.accountKey));
    for (const record of dynamic) {
      result.push(publicAccount({ key: record.accountKey, label: record.label, kind: 'client', lastVerifiedAt: record.lastVerifiedAt }));
    }
    if (!result.length || result[0].key !== 'primary' || result.length > this.maxAccounts) throw new CredentialStoreError();
    return result;
  }

  async get(accountKey) {
    const key = validateBolAccountKey(accountKey);
    const record = await this.repository.getBolAccountRecord(key);
    let credentials;
    let cacheRevision;
    if (record) {
      const validRecord = this.#validateRecord(record);
      credentials = this.vault.open(key, validRecord);
      cacheRevision = `managed:${validRecord.revision}:${validRecord.updatedAt}`;
    } else {
      const staticAccount = this.staticAccounts.get(key);
      if (!staticAccount) throw new ValidationError();
      credentials = { clientId: staticAccount.clientId, clientSecret: staticAccount.clientSecret };
      cacheRevision = `environment:${this.vault.fingerprint(staticAccount.clientId)}`;
    }
    const cached = this.cache.get(key);
    if (cached?.revision === cacheRevision) return cached.client;
    const client = this.clientFactory(credentials);
    if (!client || typeof client.getOrdersPage !== 'function' || typeof client.getShipmentsPage !== 'function'
      || typeof client.getOrder !== 'function' || typeof client.getShipment !== 'function') throw new CredentialStoreError();
    this.cache.set(key, { revision: cacheRevision, client });
    return client;
  }

  async connect({ accountKey = null, label = null, clientId, clientSecret, session, requestId, now }) {
    if (!session || typeof requestId !== 'string' || !requestId || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new ValidationError();
    }
    const credentials = validateBolCredentials({ clientId, clientSecret });
    const directory = await this.listAccounts();
    const creating = accountKey == null;
    let key;
    let nextLabel;
    let kind;
    if (creating) {
      if (directory.length >= this.maxAccounts) throw new AccountLimitError();
      key = generatedAccountKey();
      nextLabel = validateBolAccountLabel(label);
      kind = 'client';
    } else {
      key = validateBolAccountKey(accountKey);
      const existing = directory.find((account) => account.key === key);
      if (!existing) throw new ValidationError();
      nextLabel = existing.label;
      kind = existing.kind;
    }

    const fingerprint = this.vault.fingerprint(credentials.clientId);
    for (const staticAccount of this.staticAccounts.values()) {
      if (staticAccount.key !== key && this.vault.fingerprint(staticAccount.clientId) === fingerprint) throw new DuplicateAccountError();
    }
    const duplicate = await this.repository.findBolAccountByFingerprint(fingerprint);
    if (duplicate && duplicate.accountKey !== key) throw new DuplicateAccountError();

    const candidate = this.clientFactory(credentials);
    if (!candidate || typeof candidate.verifyConnection !== 'function') throw new CredentialStoreError();
    await candidate.verifyConnection();

    const envelope = this.vault.seal(key, credentials);
    const existingRecord = await this.repository.getBolAccountRecord(key);
    const saved = await this.repository.saveBolAccount({
      accountKey: key,
      label: nextLabel,
      accountKind: kind,
      envelope,
      stationId: session.stationId,
      principalId: session.principalId,
      requestId,
      action: creating && !existingRecord ? 'created' : 'credentials_updated',
      now,
    });
    this.cache.set(key, { revision: `managed:${saved.revision}:${saved.updatedAt}`, client: candidate });
    return publicAccount({ key, label: nextLabel, kind, lastVerifiedAt: saved.lastVerifiedAt });
  }
}

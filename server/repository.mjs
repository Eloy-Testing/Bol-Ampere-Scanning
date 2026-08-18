import { DatabaseError } from './errors.mjs';

function iso(value) {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function nullable(value) {
  return value == null || value === '' ? null : value;
}

function stateRecord(row) {
  return {
    workday: String(row.workday),
    trackingCode: String(row.tracking_code),
    shipmentId: nullable(row.shipment_id),
    orderId: nullable(row.order_id),
    sourceAccount: nullable(row.source_account),
    outcome: String(row.outcome),
    reason: String(row.reason),
    firstSeenAt: String(row.first_seen_at),
    acceptedAt: nullable(row.accepted_at),
    cancelledAt: nullable(row.cancelled_at),
    updatedAt: String(row.updated_at),
  };
}

function workdayStateStatement(workday) {
  return {
    sql: `WITH candidates AS (
            SELECT workday, tracking_code, shipment_id, order_id, source_account, source_account_key,
                   outcome, reason, first_seen_at, accepted_at, cancelled_at, updated_at,
                   identity_source, identity_shipment
            FROM ampere_package_state_v2
            WHERE workday = ? OR (workday = date(?, '-1 day') AND outcome IN ('accepted', 'cancelled'))
            UNION ALL
            SELECT workday, tracking_code, shipment_id, order_id, source_account, source_account_key,
                   outcome, reason, first_seen_at, accepted_at, cancelled_at, updated_at,
                   COALESCE(source_account_key, source_account, '') AS identity_source,
                   COALESCE(shipment_id, '') AS identity_shipment
            FROM ampere_package_state
            WHERE workday = ? OR (workday = date(?, '-1 day') AND outcome IN ('accepted', 'cancelled'))
          ), ranked AS (
            SELECT *, ROW_NUMBER() OVER (
              PARTITION BY tracking_code, identity_source, identity_shipment
              ORDER BY CASE outcome WHEN 'cancelled' THEN 2 WHEN 'accepted' THEN 1 ELSE 0 END DESC,
                       updated_at DESC, workday DESC
            ) AS state_rank
            FROM candidates
          )
          SELECT workday, tracking_code, shipment_id, order_id,
                 COALESCE(source_account_key, source_account) AS source_account, outcome, reason,
                 first_seen_at, accepted_at, cancelled_at, updated_at
          FROM ranked
          WHERE state_rank = 1
          ORDER BY updated_at DESC, tracking_code ASC`,
    args: [workday, workday, workday, workday],
  };
}

function bolAccountRecord(row) {
  if (!row) return null;
  return {
    accountKey: String(row.account_key),
    label: String(row.label),
    accountKind: String(row.account_kind),
    envelopeVersion: Number(row.envelope_version),
    credentialCiphertext: String(row.credential_ciphertext),
    credentialIv: String(row.credential_iv),
    credentialTag: String(row.credential_tag),
    credentialFingerprint: String(row.credential_fingerprint),
    revision: Number(row.revision),
    active: Number(row.active) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastVerifiedAt: String(row.last_verified_at),
  };
}

export class ScannerRepository {
  constructor(client) {
    this.client = client;
  }

  async #execute(statement) {
    try {
      return await this.client.execute(statement);
    } catch {
      throw new DatabaseError();
    }
  }

  async #batch(statements) {
    try {
      return await this.client.batch(statements, 'write');
    } catch {
      throw new DatabaseError();
    }
  }

  async getLockout(sourceKey, now) {
    const result = await this.#execute({
      sql: `SELECT failed_count, locked_until
            FROM ampere_auth_lockouts WHERE source_key = ? LIMIT 1`,
      args: [sourceKey],
    });
    const row = result.rows[0];
    if (!row || !row.locked_until || String(row.locked_until) <= iso(now)) return null;
    return { failedCount: Number(row.failed_count), lockedUntil: String(row.locked_until) };
  }

  async recordAuthFailure(sourceKey, now, { windowSeconds, lockSeconds, failureLimit }, audit) {
    const timestamp = iso(now);
    const resetBefore = iso(new Date(new Date(now).getTime() - windowSeconds * 1000));
    const lockUntil = iso(new Date(new Date(now).getTime() + lockSeconds * 1000));
    const statements = [
      {
        sql: `INSERT INTO ampere_auth_lockouts
                (source_key, failed_count, window_started_at, locked_until, updated_at)
              VALUES (?, 1, ?, NULL, ?)
              ON CONFLICT(source_key) DO UPDATE SET
                failed_count = CASE
                  WHEN ampere_auth_lockouts.locked_until > ? THEN ampere_auth_lockouts.failed_count
                  WHEN ampere_auth_lockouts.window_started_at <= ? THEN 1
                  ELSE ampere_auth_lockouts.failed_count + 1
                END,
                window_started_at = CASE
                  WHEN ampere_auth_lockouts.locked_until > ? THEN ampere_auth_lockouts.window_started_at
                  WHEN ampere_auth_lockouts.window_started_at <= ? THEN excluded.window_started_at
                  ELSE ampere_auth_lockouts.window_started_at
                END,
                locked_until = CASE
                  WHEN ampere_auth_lockouts.locked_until > ? THEN ampere_auth_lockouts.locked_until
                  WHEN (CASE WHEN ampere_auth_lockouts.window_started_at <= ? THEN 1 ELSE ampere_auth_lockouts.failed_count + 1 END) >= ? THEN ?
                  ELSE NULL
                END,
                updated_at = excluded.updated_at`,
        args: [sourceKey, timestamp, timestamp, timestamp, resetBefore, timestamp, resetBefore, timestamp, resetBefore, failureLimit, lockUntil],
      },
      {
        sql: `INSERT INTO ampere_auth_attempts
                (source_key, station_label, operator_label, outcome, request_id, occurred_at)
              SELECT source_key, ?, ?,
                     CASE WHEN locked_until > ? THEN 'locked' ELSE 'failure' END,
                     ?, ?
              FROM ampere_auth_lockouts WHERE source_key = ?`,
        args: [audit.stationLabel, audit.operatorLabel, timestamp, audit.requestId, timestamp, sourceKey],
      },
      {
        sql: `SELECT failed_count, locked_until
              FROM ampere_auth_lockouts WHERE source_key = ? LIMIT 1`,
        args: [sourceKey],
      },
    ];
    const results = await this.#batch(statements);
    const row = results[2].rows[0];
    return {
      failedCount: Number(row.failed_count),
      lockedUntil: nullable(row.locked_until),
    };
  }

  async clearAuthFailures(sourceKey, now, audit) {
    await this.#batch([
      { sql: 'DELETE FROM ampere_auth_lockouts WHERE source_key = ?', args: [sourceKey] },
      {
        sql: `INSERT INTO ampere_auth_attempts
                (source_key, station_label, operator_label, outcome, request_id, occurred_at)
              VALUES (?, ?, ?, 'success', ?, ?)`,
        args: [sourceKey, audit.stationLabel, audit.operatorLabel, audit.requestId, iso(now)],
      },
    ]);
  }

  async createSession({ tokenHash, stationId, operatorLabel, principalId, sourceKey, requestId, now, expiresAt }) {
    const timestamp = iso(now);
    const results = await this.#batch([
      {
        sql: `INSERT INTO ampere_stations (station_id, label, active, created_at, updated_at)
              VALUES (?, ?, 1, ?, ?)
              ON CONFLICT(station_id) DO UPDATE SET label = excluded.label, updated_at = excluded.updated_at
              WHERE ampere_stations.active = 1`,
        args: [stationId, stationId, timestamp, timestamp],
      },
      {
        sql: `INSERT INTO ampere_principals (principal_id, label, active, created_at, updated_at)
              VALUES (?, ?, 1, ?, ?)
              ON CONFLICT(principal_id) DO UPDATE SET label = excluded.label, updated_at = excluded.updated_at
              WHERE ampere_principals.active = 1`,
        args: [principalId, operatorLabel, timestamp, timestamp],
      },
      {
        sql: `INSERT INTO ampere_sessions
                (token_hash, station_id, principal_id, source_key, request_id, created_at, expires_at, last_seen_at, revoked_at)
              SELECT ?, s.station_id, p.principal_id, ?, ?, ?, ?, ?, NULL
              FROM ampere_stations s, ampere_principals p
              WHERE s.station_id = ? AND p.principal_id = ? AND s.active = 1 AND p.active = 1`,
        args: [tokenHash, sourceKey, requestId, timestamp, iso(expiresAt), timestamp, stationId, principalId],
      },
      {
        sql: `INSERT INTO ampere_session_audit
                (token_hash, station_id, principal_id, action, request_id, occurred_at)
              SELECT token_hash, station_id, principal_id, 'login_success', ?, ?
              FROM ampere_sessions WHERE token_hash = ?`,
        args: [requestId, timestamp, tokenHash],
      },
    ]);
    if (Number(results[2].rowsAffected || 0) !== 1 || Number(results[3].rowsAffected || 0) !== 1) {
      throw new DatabaseError();
    }
  }

  async getSession(tokenHash, now, requestId) {
    const timestamp = iso(now);
    const result = await this.#execute({
      sql: `SELECT s.token_hash, s.station_id, s.principal_id, s.expires_at, s.revoked_at,
                   st.active AS station_active, p.active AS principal_active, p.label AS operator_label
            FROM ampere_sessions s
            JOIN ampere_stations st ON st.station_id = s.station_id
            JOIN ampere_principals p ON p.principal_id = s.principal_id
            WHERE s.token_hash = ? LIMIT 1`,
      args: [tokenHash],
    });
    const row = result.rows[0];
    if (!row || row.revoked_at || Number(row.station_active) !== 1 || Number(row.principal_active) !== 1) return null;
    if (String(row.expires_at) <= timestamp) {
      await this.#batch([
        {
          sql: `UPDATE ampere_sessions SET revoked_at = COALESCE(revoked_at, ?)
                WHERE token_hash = ?`,
          args: [timestamp, tokenHash],
        },
        {
          sql: `INSERT INTO ampere_session_audit
                  (token_hash, station_id, principal_id, action, request_id, occurred_at)
                VALUES (?, ?, ?, 'expired', ?, ?)`,
          args: [tokenHash, String(row.station_id), String(row.principal_id), requestId, timestamp],
        },
      ]);
      return null;
    }
    await this.#execute({
      sql: 'UPDATE ampere_sessions SET last_seen_at = ? WHERE token_hash = ? AND revoked_at IS NULL',
      args: [timestamp, tokenHash],
    });
    return {
      tokenHash,
      stationId: String(row.station_id),
      principalId: String(row.principal_id),
      operatorLabel: String(row.operator_label),
      expiresAt: String(row.expires_at),
    };
  }

  async revokeSession(session, requestId, now) {
    const timestamp = iso(now);
    await this.#batch([
      {
        sql: `UPDATE ampere_sessions SET revoked_at = COALESCE(revoked_at, ?)
              WHERE token_hash = ?`,
        args: [timestamp, session.tokenHash],
      },
      {
        sql: `INSERT INTO ampere_session_audit
                (token_hash, station_id, principal_id, action, request_id, occurred_at)
              VALUES (?, ?, ?, 'logout', ?, ?)`,
        args: [session.tokenHash, session.stationId, session.principalId, requestId, timestamp],
      },
    ]);
  }

  async getWorkdayState(workday) {
    const result = await this.#execute(workdayStateStatement(workday));
    return result.rows.map(stateRecord);
  }

  async recordScanDecision({
    workday,
    trackingCode,
    shipmentId,
    orderId,
    sourceAccount,
    outcome,
    reason,
    stationId,
    principalId,
    sessionTokenHash,
    requestId,
    now,
  }) {
    const timestamp = iso(now);
    const legacySourceAccount = ['primary', 'secondary'].includes(sourceAccount) ? sourceAccount : null;
    const sourceAccountKey = nullable(sourceAccount);
    const identitySource = sourceAccountKey || '';
    const identityShipment = nullable(shipmentId) || '';
    const acceptedAt = outcome === 'accepted' ? timestamp : null;
    const cancelledAt = outcome === 'cancelled' ? timestamp : null;
    const carryForward = {
      sql: `INSERT INTO ampere_package_state_v2
              (workday, tracking_code, identity_source, identity_shipment, shipment_id, order_id,
               source_account, source_account_key, outcome, reason, first_seen_at, accepted_at, cancelled_at,
               updated_at, station_id, principal_id, session_token_hash, request_id)
            SELECT ?, tracking_code, identity_source, identity_shipment, shipment_id, order_id,
                   source_account, source_account_key, outcome, reason, first_seen_at, accepted_at, cancelled_at,
                   updated_at, station_id, principal_id, session_token_hash, request_id
            FROM (
              SELECT * FROM (
                SELECT tracking_code, shipment_id, order_id, source_account, source_account_key, outcome, reason,
                       first_seen_at, accepted_at, cancelled_at, updated_at, station_id, principal_id,
                       session_token_hash, request_id,
                       COALESCE(source_account_key, source_account, '') AS identity_source,
                       COALESCE(shipment_id, '') AS identity_shipment
                FROM ampere_package_state
                WHERE workday IN (?, date(?, '-1 day'))
                  AND (workday = ? OR outcome IN ('accepted', 'cancelled'))
                  AND tracking_code = ?
                  AND COALESCE(source_account_key, source_account, '') = ?
                  AND COALESCE(shipment_id, '') = ?
                UNION ALL
                SELECT tracking_code, shipment_id, order_id, source_account, source_account_key, outcome, reason,
                       first_seen_at, accepted_at, cancelled_at, updated_at, station_id, principal_id,
                       session_token_hash, request_id, identity_source, identity_shipment
                FROM ampere_package_state_v2
                WHERE workday = date(?, '-1 day') AND outcome IN ('accepted', 'cancelled')
                  AND tracking_code = ? AND identity_source = ? AND identity_shipment = ?
              ) AS rollover_candidates
              ORDER BY CASE outcome WHEN 'cancelled' THEN 2 WHEN 'accepted' THEN 1 ELSE 0 END DESC,
                       updated_at DESC
              LIMIT 1
            ) AS carried_state
            WHERE 1 = 1
            ON CONFLICT(workday, tracking_code, identity_source, identity_shipment) DO UPDATE SET
              shipment_id = COALESCE(excluded.shipment_id, ampere_package_state_v2.shipment_id),
              order_id = COALESCE(excluded.order_id, ampere_package_state_v2.order_id),
              source_account = COALESCE(excluded.source_account, ampere_package_state_v2.source_account),
              source_account_key = COALESCE(excluded.source_account_key, ampere_package_state_v2.source_account_key),
              outcome = excluded.outcome,
              reason = excluded.reason,
              accepted_at = COALESCE(ampere_package_state_v2.accepted_at, excluded.accepted_at),
              cancelled_at = COALESCE(ampere_package_state_v2.cancelled_at, excluded.cancelled_at),
              updated_at = excluded.updated_at,
              station_id = excluded.station_id,
              principal_id = excluded.principal_id,
              session_token_hash = excluded.session_token_hash,
              request_id = excluded.request_id
            WHERE ampere_package_state_v2.outcome IN ('unknown', 'unverified')
               OR (excluded.outcome = 'cancelled' AND ampere_package_state_v2.outcome != 'cancelled')`,
      args: [
        workday, workday, workday, workday, trackingCode, identitySource, identityShipment,
        workday, trackingCode, identitySource, identityShipment,
      ],
    };
    const upsert = {
      sql: `INSERT INTO ampere_package_state_v2
              (workday, tracking_code, identity_source, identity_shipment, shipment_id, order_id,
               source_account, source_account_key, outcome, reason, first_seen_at,
               accepted_at, cancelled_at, updated_at, station_id, principal_id, session_token_hash, request_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(workday, tracking_code, identity_source, identity_shipment) DO UPDATE SET
              shipment_id = COALESCE(excluded.shipment_id, ampere_package_state_v2.shipment_id),
              order_id = COALESCE(excluded.order_id, ampere_package_state_v2.order_id),
              source_account = COALESCE(excluded.source_account, ampere_package_state_v2.source_account),
              source_account_key = COALESCE(excluded.source_account_key, ampere_package_state_v2.source_account_key),
              outcome = excluded.outcome,
              reason = excluded.reason,
              accepted_at = CASE
                WHEN excluded.outcome = 'accepted' THEN COALESCE(ampere_package_state_v2.accepted_at, excluded.accepted_at)
                ELSE ampere_package_state_v2.accepted_at
              END,
              cancelled_at = CASE
                WHEN excluded.outcome = 'cancelled' THEN COALESCE(ampere_package_state_v2.cancelled_at, excluded.cancelled_at)
                ELSE ampere_package_state_v2.cancelled_at
              END,
              updated_at = excluded.updated_at,
              station_id = excluded.station_id,
              principal_id = excluded.principal_id,
              session_token_hash = excluded.session_token_hash,
              request_id = excluded.request_id
            WHERE
              (excluded.outcome = 'cancelled' AND ampere_package_state_v2.outcome != 'cancelled')
              OR (excluded.outcome = 'accepted' AND ampere_package_state_v2.outcome IN ('unknown', 'unverified'))
              OR (excluded.outcome IN ('unknown', 'unverified') AND ampere_package_state_v2.outcome IN ('unknown', 'unverified'))`,
      args: [
        workday, trackingCode, identitySource, identityShipment, nullable(shipmentId), nullable(orderId),
        legacySourceAccount, sourceAccountKey, outcome, reason, timestamp,
        acceptedAt, cancelledAt, timestamp, stationId, principalId, sessionTokenHash, requestId,
      ],
    };
    const event = {
      sql: `INSERT INTO ampere_scan_events
              (workday, tracking_code, shipment_id, order_id, source_account, source_account_key, attempted_outcome, reason,
               effective_outcome, station_id, principal_id, session_token_hash, request_id, occurred_at)
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, outcome, ?, ?, ?, ?, ?
            FROM ampere_package_state_v2
            WHERE workday = ? AND tracking_code = ? AND identity_source = ? AND identity_shipment = ?`,
      args: [
        workday, trackingCode, nullable(shipmentId), nullable(orderId), legacySourceAccount, sourceAccountKey, outcome, reason,
        stationId, principalId, sessionTokenHash, requestId, timestamp,
        workday, trackingCode, identitySource, identityShipment,
      ],
    };
    const state = {
      sql: `SELECT workday, tracking_code, shipment_id, order_id,
                   COALESCE(source_account_key, source_account) AS source_account, outcome, reason,
                   first_seen_at, accepted_at, cancelled_at, updated_at
            FROM ampere_package_state_v2
            WHERE workday = ? AND tracking_code = ? AND identity_source = ? AND identity_shipment = ? LIMIT 1`,
      args: [workday, trackingCode, identitySource, identityShipment],
    };
    const results = await this.#batch([carryForward, upsert, event, state, workdayStateStatement(workday)]);
    return {
      changed: Number(results[1].rowsAffected || 0) > 0,
      record: stateRecord(results[3].rows[0]),
      records: results[4].rows.map(stateRecord),
    };
  }

  async listBolAccountRecords() {
    const result = await this.#execute({
      sql: `SELECT account_key, label, account_kind, envelope_version, credential_ciphertext,
                   credential_iv, credential_tag, credential_fingerprint, revision, active,
                   created_at, updated_at, last_verified_at
            FROM ampere_bol_accounts
            WHERE active = 1
            ORDER BY CASE account_key WHEN 'primary' THEN 0 WHEN 'secondary' THEN 1 ELSE 2 END,
                     label COLLATE NOCASE, account_key`,
      args: [],
    });
    return result.rows.map(bolAccountRecord);
  }

  async getBolAccountRecord(accountKey) {
    const result = await this.#execute({
      sql: `SELECT account_key, label, account_kind, envelope_version, credential_ciphertext,
                   credential_iv, credential_tag, credential_fingerprint, revision, active,
                   created_at, updated_at, last_verified_at
            FROM ampere_bol_accounts WHERE account_key = ? AND active = 1 LIMIT 1`,
      args: [accountKey],
    });
    return bolAccountRecord(result.rows[0]);
  }

  async findBolAccountByFingerprint(credentialFingerprint) {
    const result = await this.#execute({
      sql: `SELECT account_key, label, account_kind, envelope_version, credential_ciphertext,
                   credential_iv, credential_tag, credential_fingerprint, revision, active,
                   created_at, updated_at, last_verified_at
            FROM ampere_bol_accounts WHERE credential_fingerprint = ? AND active = 1 LIMIT 1`,
      args: [credentialFingerprint],
    });
    return bolAccountRecord(result.rows[0]);
  }

  async countBolAccountRecords() {
    const result = await this.#execute({
      sql: 'SELECT COUNT(*) AS total FROM ampere_bol_accounts WHERE active = 1',
      args: [],
    });
    return Number(result.rows[0]?.total || 0);
  }

  async saveBolAccount({
    accountKey,
    label,
    accountKind,
    envelope,
    stationId,
    principalId,
    requestId,
    action,
    now,
  }) {
    const timestamp = iso(now);
    const results = await this.#batch([
      {
        sql: `INSERT INTO ampere_bol_accounts
                (account_key, label, account_kind, envelope_version, credential_ciphertext,
                 credential_iv, credential_tag, credential_fingerprint, revision, active,
                 created_by, updated_by, created_at, updated_at, last_verified_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?)
              ON CONFLICT(account_key) DO UPDATE SET
                label = excluded.label,
                account_kind = excluded.account_kind,
                envelope_version = excluded.envelope_version,
                credential_ciphertext = excluded.credential_ciphertext,
                credential_iv = excluded.credential_iv,
                credential_tag = excluded.credential_tag,
                credential_fingerprint = excluded.credential_fingerprint,
                revision = ampere_bol_accounts.revision + 1,
                active = 1,
                updated_by = excluded.updated_by,
                updated_at = excluded.updated_at,
                last_verified_at = excluded.last_verified_at`,
        args: [
          accountKey, label, accountKind, envelope.envelopeVersion, envelope.credentialCiphertext,
          envelope.credentialIv, envelope.credentialTag, envelope.credentialFingerprint,
          principalId, principalId, timestamp, timestamp, timestamp,
        ],
      },
      {
        sql: `INSERT INTO ampere_bol_account_audit
                (account_key, label, action, station_id, principal_id, request_id, occurred_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [accountKey, label, action, stationId, principalId, requestId, timestamp],
      },
      {
        sql: `SELECT account_key, label, account_kind, envelope_version, credential_ciphertext,
                     credential_iv, credential_tag, credential_fingerprint, revision, active,
                     created_at, updated_at, last_verified_at
              FROM ampere_bol_accounts WHERE account_key = ? AND active = 1 LIMIT 1`,
        args: [accountKey],
      },
    ]);
    if (Number(results[0].rowsAffected || 0) !== 1 || Number(results[1].rowsAffected || 0) !== 1 || !results[2].rows[0]) {
      throw new DatabaseError();
    }
    return bolAccountRecord(results[2].rows[0]);
  }
}

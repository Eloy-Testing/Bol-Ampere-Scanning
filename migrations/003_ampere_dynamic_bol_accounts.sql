CREATE TABLE IF NOT EXISTS ampere_bol_accounts (
  account_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  account_kind TEXT NOT NULL CHECK (account_kind IN ('internal', 'client')),
  envelope_version INTEGER NOT NULL CHECK (envelope_version = 1),
  credential_ciphertext TEXT NOT NULL,
  credential_iv TEXT NOT NULL,
  credential_tag TEXT NOT NULL,
  credential_fingerprint TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_verified_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ampere_bol_accounts_fingerprint_idx
  ON ampere_bol_accounts(credential_fingerprint);

CREATE INDEX IF NOT EXISTS ampere_bol_accounts_active_label_idx
  ON ampere_bol_accounts(active, label, account_key);

CREATE TABLE IF NOT EXISTS ampere_bol_account_audit (
  event_id INTEGER PRIMARY KEY,
  account_key TEXT NOT NULL,
  label TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'credentials_updated')),
  station_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ampere_bol_account_audit_time_idx
  ON ampere_bol_account_audit(occurred_at, account_key);

ALTER TABLE ampere_package_state
  ADD COLUMN source_account_key TEXT CHECK (source_account_key IS NULL OR length(source_account_key) BETWEEN 1 AND 80);

ALTER TABLE ampere_scan_events
  ADD COLUMN source_account_key TEXT CHECK (source_account_key IS NULL OR length(source_account_key) BETWEEN 1 AND 80);

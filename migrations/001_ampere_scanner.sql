CREATE TABLE IF NOT EXISTS ampere_stations (
  station_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ampere_principals (
  principal_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ampere_auth_lockouts (
  source_key TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  window_started_at TEXT NOT NULL,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ampere_auth_attempts (
  attempt_id INTEGER PRIMARY KEY,
  source_key TEXT NOT NULL,
  station_label TEXT NOT NULL,
  operator_label TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('failure', 'locked', 'success')),
  request_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ampere_auth_attempts_time_idx
  ON ampere_auth_attempts(occurred_at);

CREATE TABLE IF NOT EXISTS ampere_sessions (
  token_hash TEXT PRIMARY KEY,
  station_id TEXT NOT NULL REFERENCES ampere_stations(station_id),
  principal_id TEXT NOT NULL REFERENCES ampere_principals(principal_id),
  source_key TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS ampere_sessions_expiry_idx
  ON ampere_sessions(expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS ampere_session_audit (
  event_id INTEGER PRIMARY KEY,
  token_hash TEXT,
  station_id TEXT,
  principal_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('login_success', 'logout', 'expired', 'revoked')),
  request_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ampere_session_audit_time_idx
  ON ampere_session_audit(occurred_at);

CREATE TABLE IF NOT EXISTS ampere_package_state (
  workday TEXT NOT NULL,
  tracking_code TEXT NOT NULL,
  shipment_id TEXT,
  order_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'cancelled', 'unknown', 'unverified')),
  reason TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  accepted_at TEXT,
  cancelled_at TEXT,
  updated_at TEXT NOT NULL,
  station_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL,
  request_id TEXT NOT NULL,
  PRIMARY KEY (workday, tracking_code)
);

CREATE INDEX IF NOT EXISTS ampere_package_state_workday_outcome_idx
  ON ampere_package_state(workday, outcome, updated_at);

CREATE TABLE IF NOT EXISTS ampere_scan_events (
  event_id INTEGER PRIMARY KEY,
  workday TEXT NOT NULL,
  tracking_code TEXT NOT NULL,
  shipment_id TEXT,
  order_id TEXT,
  attempted_outcome TEXT NOT NULL CHECK (attempted_outcome IN ('accepted', 'cancelled', 'unknown', 'unverified')),
  reason TEXT NOT NULL,
  effective_outcome TEXT NOT NULL CHECK (effective_outcome IN ('accepted', 'cancelled', 'unknown', 'unverified')),
  station_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL,
  request_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ampere_scan_events_lookup_idx
  ON ampere_scan_events(workday, tracking_code, occurred_at);

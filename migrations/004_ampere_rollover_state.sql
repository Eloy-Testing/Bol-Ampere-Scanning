CREATE TABLE IF NOT EXISTS ampere_package_state_v2 (
  workday TEXT NOT NULL,
  tracking_code TEXT NOT NULL,
  identity_source TEXT NOT NULL,
  identity_shipment TEXT NOT NULL,
  shipment_id TEXT,
  order_id TEXT,
  source_account TEXT CHECK (source_account IS NULL OR source_account IN ('primary', 'secondary')),
  source_account_key TEXT CHECK (source_account_key IS NULL OR length(source_account_key) BETWEEN 1 AND 80),
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
  PRIMARY KEY (workday, tracking_code, identity_source, identity_shipment),
  CHECK (identity_source = COALESCE(source_account_key, source_account, '')),
  CHECK (identity_shipment = COALESCE(shipment_id, ''))
);

CREATE INDEX IF NOT EXISTS ampere_package_state_v2_workday_outcome_idx
  ON ampere_package_state_v2(workday, outcome, updated_at);

ALTER TABLE ampere_scan_events
  ADD COLUMN source_account_incarnation TEXT CHECK (source_account_incarnation IS NULL OR length(source_account_incarnation) BETWEEN 8 AND 96);

CREATE TABLE IF NOT EXISTS ampere_reconciliation_runs (
  run_id TEXT PRIMARY KEY,
  workday TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('bol_shipment_observed', 'stockitup_label')),
  status TEXT NOT NULL CHECK (status IN ('complete', 'failed')),
  account_count INTEGER NOT NULL CHECK (account_count >= 0),
  package_count INTEGER NOT NULL CHECK (package_count >= 0),
  failure_code TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ampere_reconciliation_runs_workday_idx
  ON ampere_reconciliation_runs(workday, status, completed_at);

CREATE TABLE IF NOT EXISTS ampere_reconciliation_run_accounts (
  run_id TEXT NOT NULL REFERENCES ampere_reconciliation_runs(run_id),
  account_incarnation TEXT NOT NULL,
  account_key TEXT NOT NULL,
  account_label TEXT NOT NULL,
  package_count INTEGER NOT NULL CHECK (package_count >= 0),
  PRIMARY KEY (run_id, account_incarnation)
);

CREATE INDEX IF NOT EXISTS ampere_reconciliation_run_accounts_lookup_idx
  ON ampere_reconciliation_run_accounts(account_incarnation, run_id);

CREATE TABLE IF NOT EXISTS ampere_reconciliation_parcels (
  account_incarnation TEXT NOT NULL,
  tracking_code TEXT NOT NULL,
  account_key TEXT NOT NULL,
  account_label TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('bol_shipment_observed', 'stockitup_label')),
  source_workday TEXT NOT NULL,
  source_created_at TEXT NOT NULL,
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  cancelled_at TEXT,
  cancelled_observed_at TEXT,
  last_run_id TEXT NOT NULL REFERENCES ampere_reconciliation_runs(run_id),
  PRIMARY KEY (account_incarnation, tracking_code)
);

CREATE INDEX IF NOT EXISTS ampere_reconciliation_parcels_workday_idx
  ON ampere_reconciliation_parcels(source_workday, account_incarnation, tracking_code);

CREATE TABLE IF NOT EXISTS ampere_reconciliation_shipments (
  account_incarnation TEXT NOT NULL,
  shipment_id TEXT NOT NULL,
  tracking_code TEXT NOT NULL,
  order_id TEXT NOT NULL,
  shipment_datetime TEXT NOT NULL,
  item_fingerprint TEXT NOT NULL,
  last_run_id TEXT NOT NULL REFERENCES ampere_reconciliation_runs(run_id),
  PRIMARY KEY (account_incarnation, shipment_id)
);

CREATE INDEX IF NOT EXISTS ampere_reconciliation_shipments_parcel_idx
  ON ampere_reconciliation_shipments(account_incarnation, tracking_code, shipment_datetime);

CREATE TABLE IF NOT EXISTS ampere_reconciliation_items (
  account_incarnation TEXT NOT NULL,
  shipment_id TEXT NOT NULL,
  order_item_id TEXT NOT NULL,
  tracking_code TEXT NOT NULL,
  cancelled INTEGER NOT NULL CHECK (cancelled IN (0, 1)),
  last_run_id TEXT NOT NULL REFERENCES ampere_reconciliation_runs(run_id),
  PRIMARY KEY (account_incarnation, shipment_id, order_item_id)
);

CREATE INDEX IF NOT EXISTS ampere_reconciliation_items_parcel_idx
  ON ampere_reconciliation_items(account_incarnation, tracking_code, cancelled);

CREATE TABLE IF NOT EXISTS ampere_daily_closures (
  workday TEXT NOT NULL,
  account_incarnation TEXT NOT NULL,
  account_key TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES ampere_reconciliation_runs(run_id),
  PRIMARY KEY (workday, account_incarnation)
);

CREATE INDEX IF NOT EXISTS ampere_daily_closures_account_idx
  ON ampere_daily_closures(account_incarnation, workday);

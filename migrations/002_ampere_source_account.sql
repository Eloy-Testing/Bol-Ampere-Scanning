ALTER TABLE ampere_package_state
  ADD COLUMN source_account TEXT CHECK (source_account IS NULL OR source_account IN ('primary', 'secondary'));

ALTER TABLE ampere_scan_events
  ADD COLUMN source_account TEXT CHECK (source_account IS NULL OR source_account IN ('primary', 'secondary'));

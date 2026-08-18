# Daily label reconciliation — design contract

## Surface classification

- Surface: operational internal dashboard inside the existing scanner.
- Primary standard: dense comparison, fast exception recognition, and reliable repeated use.
- User moment: an operator or supervisor needs to know whether every expected parcel was handed over for one Amsterdam workday.
- Dominant action: open the unresolved list and act on missing or contradictory packages.
- Risk if generic: decorative metrics obscure the actual difference, or the report claims exact printed-label truth that the connected sources do not prove.
- Design bias: preserve the scanner as the main workspace; open reconciliation as a focused dialog with compact metrics and a package-level exception table.
- Anti-patterns blocked: marketing-style hero cards, equal emphasis on every count, nested cards, raw integration errors, and unlabeled inferred data.

## Outcome and content truth

The first build records bol shipment labels as `observed`, validates package and item membership server-side, joins authoritative scanner handoff events, freezes daily close boundaries, and exposes late observations as adjustments. It does not claim StockItUp `label_created` timestamps until that source is connected.

| Metric | Definition |
|---|---|
| Observed labels | Distinct physical tracking identities first observed in complete bol shipment enumeration for the selected account incarnation and workday |
| Cancelled | Observed packages whose complete linked shipment-item set is cancelled |
| Expected | Observed labels minus cancelled packages |
| Scanned | Expected packages with an accepted scanner handoff event for the same account incarnation |
| Missing | Expected packages without an accepted handoff event |
| Adjustments | Package or cancellation facts first observed after the workday close |

## Flow and hierarchy

1. The scanner remains the default focal surface and scanning behavior is unchanged.
2. The operator opens `Daily report` from the authenticated utility controls.
3. The report loads the stored current-workday ledger for the selected bol account.
4. The missing count and unresolved package table form one primary decision zone.
5. `Refresh report` performs a server-owned complete source refresh; partial source data does not alter counts.
6. Date selection reads prior ledgers without silently changing them.
7. `Download CSV` exports the exact displayed package rows.

## Visual system

Reuse the existing navy, white, green, amber, red, border, typography, table, button, dialog, and responsive tokens. The missing metric uses the strongest unresolved emphasis; expected/scanned provide adjacent evidence; observed/cancelled/adjustments are secondary context. No new brand or illustration system is introduced.

## State contract

- Loading: compact report status; controls disabled only while the report request is active.
- Empty before first refresh: explain that no complete snapshot has been recorded and offer `Refresh report`.
- Success/open day: show current values and package exceptions.
- Closed day: show the close timestamp and adjustment count.
- Partial/upstream failure: retain the last complete ledger, state that totals were not changed, and offer retry.
- Unauthorized/session expiry: close the report and return to the existing login recovery.
- No missing packages: state that all expected packages are reconciled; retain summary totals.
- Source truth: visible copy says `Observed labels` and `Based on bol shipment registrations` until StockItUp label events exist.

## Responsive and accessibility contract

At 1440x980 the dialog shows the metric row and exception table without hiding the decision zone. At 390x900 metrics reflow to two columns and the table uses horizontal containment rather than page overflow. Dialog title, status, date, refresh, export, exception rows, and close action remain keyboard reachable in task order. Status changes use a polite live region; raw API, SQL, pagination, and verification details remain telemetry-only.

## Acceptance evidence

Additive migration and repository tests; service tests for stable enumeration, identity, item cancellation, retry, and cutoff/DST; application route tests; browser tests for loading, empty, success, failure preservation, date/account scope, export, keyboard and mobile overflow; full server/browser suites; current desktop/mobile screenshots; validated visual-outcome receipt and adoption manifest.

# Daily label reconciliation — implementation plan

Planning mode: formal, one bounded named-risk review completed before mutation.

Named risk: the proposed ledger could double-count or silently miss labels across refreshes, account collisions, order changes, cancellations, and the 16:00 Amsterdam cutoff.

Material review adjustments adopted:

1. Persist an immutable account incarnation derived from the credential fingerprint; a credential rotation to another seller cannot inherit old package identity.
2. Freeze half-open Amsterdam workday intervals and accept source enumeration only after two consecutive stable page passes match.
3. Persist shipment-item membership and derive package cancellation from the exact complete item set rather than a scalar order flag.

## Acceptance ledger

| ID | Required outcome | Observable verification |
|---|---|---|
| R1 | Complete server-owned ingestion | Browser facts are never trusted; all configured account/page/detail/order reads validate before one atomic repository commit |
| R2 | Stable physical-package identity | Same tracking across accounts stays separate; multiple shipments with the same account/tracking collapse into one parcel; credential seller changes create a new incarnation |
| R3 | Exact cutoff behavior | Source timestamps map to `[previous 16:00, current 16:00)` in Europe/Amsterdam, including DST and exact-boundary tests |
| R4 | Item-scoped cancellation | Every shipment item matches an authoritative order item; a package is cancelled only when its complete linked item set is cancelled |
| R5 | Reconciled handoff | Accepted scan events join the same account incarnation and tracking identity; cancelled-after-scan is an explicit exception |
| R6 | Immutable close with adjustments | Closed-day baseline remains frozen; observations received after close are counted and listed as adjustments |
| R7 | Useful report surface | Selected account/day shows observed, cancelled, expected, scanned, missing, adjustments, unresolved rows, source truth, and CSV export |
| R8 | Failure preservation | Failed refresh displays an actionable error and retains the prior complete report unchanged |
| R9 | Existing scanner safety | Authentication, FIFO, Enter handling, automatic refocus, account switching, and scan decisions remain green |
| R10 | Branch delivery | Migration, server, browser, visual, and adoption gates pass; exact branch and commit are pushed without deployment |

## Implementation order

1. Add workday-bound helpers and immutable account-incarnation resolution.
2. Add the reconciliation migration, repository atomic snapshot/report methods, and service enumeration/validation.
3. Add the authenticated same-origin reconciliation API.
4. Add the report dialog, localized states, account/day scope, exception table, and CSV export.
5. Extend deterministic server and Playwright fixtures for the new states and failure modes.
6. Run local migration, server tests, full browser tests, diff checks, and branch hygiene.
7. Inspect current desktop/mobile output, repair defects, validate the visual receipt and adoption manifest.
8. Commit and push `codex/daily-label-reconciliation`; do not deploy or run a live StockItUp integration.

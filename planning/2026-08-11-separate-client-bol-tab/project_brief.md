# Project Brief

Generated: 2026-08-11

## Literal Request

Separate the newly added client Bol account so it appears on its own tab.

## Target Surface

The authenticated static browser station at `index.html`, released only through the approved `bol-ampere-scanning` Vercel project.

## Ownership And Accounts

The repository owns the standalone scanner. The fixed primary and secondary Bol sources are already approved and configured server-side; the only release account is Vercel team `Zander's projects`, project `bol-ampere-scanning`. No account access beyond those existing approvals is required.

## Source Of Truth

Bol is the source of truth for orders, shipments, tracking identity, and cancellations. The existing `ampere_*` operational state is source-aware only where a live verification established the source. Browser presentation must never replace either source of truth.

## Intended Outcome

The already released two-source warehouse station retains the existing Bankhoes primary flow, but no longer combines it with client account data. The primary tab is selected by default; selecting Client Bol shows only that account’s live source-qualified operational worklist and uses that account for scan verification.

## Scope

- Add an explicit authenticated account tab control only when the existing fixed secondary source is configured.
- Scope visible orders, shipments, counts, accepted records, and cancellations to the selected source.
- Preserve one atomic complete snapshot refresh and the existing fail-closed behavior; no source becomes scannable from partial data.
- Bind scan lookup and request identity to the active tab; retain FIFO, Enter handling, and automatic refocus.
- Keep source-unqualified STOP review visible as shared safety history instead of silently assigning it to an account.
- Update browser/server state contracts, deterministic browser fixtures/tests, documentation, release evidence, and current visual review.

## Affected Surfaces

| Surface | Responsibility |
|---|---|
| `index.html` | Account tabs, selected-source rendering, source-bound scan lookup, focus behavior, and localized copy. |
| `server/application.mjs` | Source-aware state projection only where the browser needs safe record provenance. |
| Browser fixtures/tests | Deterministic source-specific snapshot, scan, state, and tab behavior. |
| `README.md` | Non-secret operator guidance for fixed account tabs. |
| `verification/**` | Exact released browser and adoption evidence. |

## Explicit Exclusions

- No Bol retailer write, Ads API use, account-settings access, or account discovery.
- No credential, token, warehouse-password, session-secret, or account-identifier persistence or display.
- No Turso schema/data migration or change outside existing `ampere_*` state behavior.
- No arbitrary account registry, third source, unrelated repository, Vercel project, or deployment target.

## Excluded Surfaces

Credentials, external account configuration, database migration/data writes, Bol mutations, and unrelated projects remain untouched.

## Known Constraints

- Browser code may only use same-origin `/api/*` routes.
- Operational state cannot use browser storage.
- The full snapshot stays atomic and stale/partial state cannot enable scanning.
- The queue is FIFO, Enter-terminated, and automatically refocused.
- Browser-visible completion requires current desktop and mobile visual proof.

## Acceptance Ledger

| ID | Required outcome | Observable proof |
|---|---|---|
| OUT-1 | The Bankhoes source remains the default operational tab. | Authenticated desktop/mobile browser review and browser test show primary selected first. |
| OUT-2 | Client Bol has an explicit separate tab, and each source-qualified worklist/metric/state appears only under its source. | Fixture tests and live browser review show source-scoped rows/counts before and after a tab change. |
| OUT-3 | A tracking code is looked up and live-verified only through the selected source; an identical code across both sources remains a global fail-closed snapshot collision. | Browser test sends the active account with scan and preserves global collision blocking. |
| OUT-4 | Incomplete, stale, unknown, unverified, or active-verification states remain fail closed; source-unqualified STOP history is not hidden. | Browser/server state tests show disabled/recovery and STOP behavior. |
| OUT-5 | The approved released artifact passes repository tests and current desktop/mobile visual verification without secret exposure. | Local suites, exact Vercel deployment identity, deployment-bound visual receipt, and adoption manifest validation. |

## Verification Matrix

| Requirement | Local evidence | Released evidence |
|---|---|---|
| Explicit source tabs | Browser fixture selection and ARIA/focus assertions. | Desktop/mobile authenticated selected-tab screenshots. |
| No mixed operational queue | Primary/client row, metric, and state separation assertions. | Selected source worklist inspection. |
| Safe scan identity | Request captures account and shipment from selected source; cross-source collision remains blocked before scanning. | Same-origin API/browser interaction check. |
| Fail closed | Unknown/unverified/active decision and stale snapshot regressions. | Ready/STOP/recovery surface inspection. |
| Secure release | Diff and secret scan. | Exact approved deployment/config identity without values. |

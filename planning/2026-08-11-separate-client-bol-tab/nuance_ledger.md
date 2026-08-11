# Nuance Ledger

Generated: 2026-08-11

## Literal Request

Put the client Bol account on a separate tab.

## Implied Goal

Keep operational decisions distinct by fixed Bol source without disrupting the primary station flow.

## Unacceptable Narrow Interpretation

A visual label or filter that still leaves mixed rows, metrics, scan lookup, or progress state in a combined worklist.

## Chosen Interpretation

Use explicit fixed source tabs over the existing atomic two-source snapshot, with the selected source controlling every source-qualified visible worklist and scan identity.

## Explicit Exclusions

Do not change credentials, database schema/data, Bol retailer resources, account configuration, or any other deployment.

## Assumptions

- `primary` remains the established Bankhoes source and `secondary` is the supplied client source.
- Existing server scan routing accepts only those fixed source keys.
- Existing atomic snapshot health is the safe current model for both source tabs.

## Ambiguities

The request does not ask for independent per-account outage recovery or historical reassignment of accountless STOP records. Both remain outside this bounded UI release.

## Consequence-Aware Interpretation

Source-qualified records can be safely scoped because their account is live-verified; unknown/unverified records cannot, so their STOP history must remain visible rather than become invisible after tab filtering.

| ID | Detail | Failure if missed | Plan response | Evidence |
|---|---|---|---|---|
| N1 | The second account is already configured and released; this request changes user-facing separation, not credential setup. | Secret/config scope could be unnecessarily broadened. | Do not touch credentials, migration, or Vercel environment variables. | Target paths and release diff. |
| N2 | A global `trackIndex` currently represents both account sources, and persistent package state keys by workday/tracking code. | A same-code collision cannot be safely treated as two independently countable packages without a data-identity change. | Retain the global collision block; derive source views only after a unique complete snapshot validates. | Retained collision fail-closed browser/server regression. |
| N3 | A scan request already accepts a fixed account key. | A selected tab could render one source but verify against another. | Derive `account`, shipment id, and code from one selected snapshot object. | Scan request assertion. |
| N4 | Persisted unknown/unverified records may have no verified source account by design. | Filtering every STOP by source could hide a package requiring manual review. | Leave source-unqualified STOP review visible as shared safety history. | State rendering/browser test. |
| N5 | Scanner throughput relies on Enter-only FIFO and automatic focus. | Account selection could race a queued scan or leave the scanner unfocused. | Disable switches while resolving a scan and refocus only after an idle source selection. | Keyboard/focus test. |
| N6 | The current snapshot is atomically complete across configured sources. | An unrequested refresh-availability change could weaken established fail-closed semantics. | Keep all-or-nothing refresh behavior in this bounded UI release. | Existing incomplete-source regression remains passing. |
| N7 | Product UI is localized. | New source controls could leave untranslated raw text. | Add account labels/state text through the existing locale dictionaries. | Browser text assertions in English plus manual locale code review. |
| N8 | The task is browser-visible and release-shaped. | Passing tests alone would not prove tabs are usable on the station. | Capture fresh desktop/mobile authenticated evidence and validate the current receipt. | Deployment-bound VOR and adoption manifest. |

## Verification Evidence Required

Primary default, exclusive source rows/counts, selected-source scan request, retained global collision fail-closed behavior, source-unqualified STOP visibility, focus/tab locking, local suites, exact deployment, and current desktop/mobile browser receipt.

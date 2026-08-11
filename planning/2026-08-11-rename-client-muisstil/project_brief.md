# Project Brief

Generated: 2026-08-11

## Literal Request

Client name is Muisstil.

## Target Surface

The existing secondary account label in the authenticated `index.html` warehouse scan station, released only to Vercel project `bol-ampere-scanning`.

## Ownership And Accounts

The repository owns the scanner. The already approved Vercel account/team/project may be used only to release and verify this label correction. The secondary Bol credentials remain approved but are not accessed, changed, or displayed.

## Source Of Truth

Zander supplied Muisstil as the fixed client-facing name. Internal `secondary` source identity and Bol credentials remain server-side implementation details.

## Intended Outcome

The secondary tab and the non-secret operator documentation say Muisstil consistently, while the existing account binding, scan behavior, and fail-closed contracts do not change.

## Scope

- Update static and localized secondary tab copy to Muisstil.
- Add a regression assertion for the exact secondary label.
- Update current operator documentation.
- Release and inspect the exact approved production artifact.

## Affected Surfaces

| Surface | Responsibility |
|---|---|
| `index.html` | Static fallback and localized Muisstil account-tab label. |
| `tests/data-health.spec.mjs` | Secondary account-label regression. |
| `README.md` | Operator documentation. |
| `verification/2026-08-11-rename-client-muisstil-*` | New deployment-bound visual evidence and receipt; earlier Client Bol evidence remains historical. |

## Excluded Surfaces

- No source-key, API route, scan logic, session, credential, Vercel-environment, Turso, migration, or retailer mutation change.
- No historical planning/evidence rewrite; prior Client Bol records remain historical. A new Muisstil-specific visual contract, browser state, screenshots, and receipt are added alongside them.
- No external account access beyond the approved Vercel release and existing authenticated scanner verification.

## Known Constraints

- Browser copy must not expose credential or account-identifying values.
- The secondary tab is optional and appears only when configured.
- Existing scanner focus, FIFO, Enter, and source switching behavior remain unchanged.

## Verification Matrix

| ID | Required outcome | Observable proof |
|---|---|---|
| OUT-1 | The operator-facing secondary tab is Muisstil in each supported language. | Browser label assertion and live authenticated inspection. |
| OUT-2 | The static fallback, localized render, and README use the same current name. | Targeted source/diff review. |
| OUT-3 | The label correction does not alter source identity or scan safety. | Full server/browser suites and unchanged source-key assertions. |
| OUT-4 | The approved deployment visibly presents Muisstil at desktop and mobile widths. | Exact deployment identity and validated visual/adoption receipts. |

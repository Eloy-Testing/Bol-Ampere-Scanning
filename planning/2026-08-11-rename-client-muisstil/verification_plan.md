# Verification Plan

Generated: 2026-08-11

## Task Classification

Formal browser-visible release correction with no data, credential, or source-identity mutation.

## Required Evidence

| Finish line | Required evidence |
|---|---|
| Formal plan | Sealed V2 review packet and validated PASS review. |
| Contract gates | Valid retrieval, spatial-priority, and interface-output contracts. |
| Copy correctness | Deterministic browser coverage asserts the static fallback and the rendered NL, EN, and ES Muisstil tab labels with the optional secondary source configured; source-key request remains `secondary`. |
| Regression | `npm run migrate:local`, `npm run test:server`, and `npm run test:browser` pass. |
| Scope safety | Diff confirms no secret, source-key, API, migration, or configuration mutation. |
| Release | Commit/push and exact approved Vercel production deployment. |
| Visual outcome | Fresh authenticated desktop 1440x980 and mobile 390x900 Muisstil-tab inspection, full affected surface/overflow/console checks, and new `verification/2026-08-11-rename-client-muisstil-visual-outcome-review.json` validated against the exact deployment. |
| Adoption | Valid `creative-framework.adoption.v2` manifest bound to current `index.html`, evidence, and its task-local source-bound visual receipt. |

## Commands Or Tools

| Command or tool | Purpose |
|---|---|
| `npm run migrate:local` | Preserve required local schema regression coverage. |
| `npm run test:server` | Prove no server behavior regression. |
| `npm run test:browser` | Prove visible Muisstil label and preserved secondary scan identity. |
| Approved Vercel CLI | Deploy and identify the approved production artifact. |
| Approved browser | Inspect and capture desktop/mobile authenticated account-tab states. |

## Acceptance Criteria

Muisstil is the visible secondary label in the static fallback and each supported locale; the scan account stays `secondary`; the production tab is legible/selected at both required viewports; no page-level overflow or console errors occur; valid release receipts bind the exact artifact.

## Blocked Verification

| Check | Classification | Safe next route |
|---|---|---|
| Authenticated production tab selection | `unique_access_required` only if no authorized session remains | Use browser session discovery before requesting any interactive input. |

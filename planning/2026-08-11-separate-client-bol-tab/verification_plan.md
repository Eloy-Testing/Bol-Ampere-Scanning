# Verification Plan

Generated: 2026-08-11

## Task Classification

Formal browser-visible code and release change with a fixed existing source/account boundary.

## Required Evidence

| Finish line | Required evidence |
|---|---|
| Formal plan | Sealed V2 review packet and a validated PASS plan review. |
| Contract gates | Valid retrieval, spatial-priority, and interface-output contracts before implementation. |
| Source separation | Browser tests show primary default, explicit Client Bol selection, exclusive source rows/metrics, source-qualified scans, and retained global same-code collision blocking. |
| State safety | Tests show source-qualified accepted/cancelled state is scoped and unknown/unverified state is never counted or hidden. |
| Regression | `npm run migrate:local`, `npm run test:server`, and `npm run test:browser` pass. |
| Release | Commit/push and only the approved `bol-ampere-scanning` Vercel deployment, with exact deployment identity. |
| User-visible result | Fresh authenticated desktop 1440x980 and mobile 390x900 screenshots show both selected tab states, safe focus, and no horizontal page overflow. |
| Outcome receipt | Valid `VISUAL_OUTCOME_REVIEW_V1` and `creative-framework.adoption.v2` receipt bound to the exact released `index.html`. |

## Negative checks

- Inspect diffs and released browser surface for credential, token, password, or account identifier exposure.
- Confirm no migration, database, or Vercel environment-variable mutation is attempted for this UI-only change.
- Confirm an active scan disables source switching and a wrong-tab code stays a STOP/non-counting decision.

## Commands Or Tools

| Command or tool | Purpose |
|---|---|
| `npm run migrate:local` | Preserve numbered local schema regression coverage. |
| `npm run test:server` | Verify source-aware state projection and server regressions. |
| `npm run test:browser` | Verify tabs, source-scoped worklists, selected scan identity, focus, and fail-closed behavior. |
| Approved Vercel CLI/API | Deploy and identify only the approved project/artifact. |
| Approved browser tooling | Inspect desktop/mobile authenticated station states and capture evidence. |

## Acceptance Criteria

The primary tab is selected initially; the client tab is explicit; each source-qualified worklist and progress view is isolated; all scans retain selected-source identity; no unsafe scan is enabled; and the exact released user-visible artifact satisfies all documented evidence gates.

## Blocked Verification

| Check | Classification | Safe next route |
|---|---|---|
| Authenticated released tab interaction | `unique_access_required` only if no authorized session persists | Use an existing session first; ask for only the necessary interactive access if required. |

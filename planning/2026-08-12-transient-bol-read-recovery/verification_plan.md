# Verification Plan

Generated: 2026-08-12

## Task Classification

Formal retry/recovery code change, browser-visible state change, and production release.

## Required Evidence

| Finish Line | Evidence Required | Status |
|---|---|---|
| Formal plan | Validated schema-3 packet and review. | pending |
| Retry correctness | Transient transport/status success, bounded exhaustion, `Retry-After`, existing `401`, and malformed `200` tests. | pending |
| Fail-closed behavior | Persistent failure and partial/invalid data still disable scanning and never count a parcel. | pending |
| Browser truth | Paused copy in NL/EN/ES; ready copy returns only after complete recovery; no desktop/mobile overflow or console error. | pending |
| Repository finish line | Local migration, full server suite, full browser suite. | pending |
| Visual finish line | Exact current local and deployed visual outcome receipts plus adoption manifest. | pending |
| Release | Commit, push, production deployment identity, post-deploy logs/API/browser evidence. | pending |

## Commands Or Tools

| Command Or Tool | Purpose | Expected Signal |
|---|---|---|
| `node --test tests/server/bol-client.test.mjs` | Focus retry boundary. | All focused tests pass. |
| `npx playwright test tests/data-health.spec.mjs` | Focus paused/recovery browser state. | All focused tests pass. |
| `npm run migrate:local` | Preserve schema finish line. | Idempotent ampere migration succeeds. |
| `npm run test:server` | Server regression suite. | All tests pass. |
| `npm run test:browser` | Full browser regression suite. | All tests pass. |
| Browser inspection | Inspect exact local/deployed artifact at desktop and mobile widths. | Paused/ready states match contract, no overflow or console error. |
| Visual/adoption validators | Bind artifact, contracts, screenshots, and closure. | Both validators exit zero. |
| Vercel CLI | Deploy and inspect only approved project. | Exact `READY` deployment and clean post-deploy readback. |

## Acceptance Criteria

- Retryable failures make no more than the fixed total attempt count per upstream request.
- `Retry-After` is honored only within the configured maximum delay.
- Malformed successful payloads are never normalized or retried into acceptance.
- Paused and ready states never contradict the enabled/disabled scanner control.
- The exact deployed artifact is verified; Vercel `READY` alone is not completion.

## Blocked Verification

If no authorized production scanner session exists, record `unique_access_required` for live authenticated state. Do not retrieve secrets, bypass auth, or call the authenticated outcome verified from local fixtures.

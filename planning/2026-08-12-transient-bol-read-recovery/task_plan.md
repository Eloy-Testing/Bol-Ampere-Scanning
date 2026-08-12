# Task Plan

Generated: 2026-08-12

## Literal Request

Repair the scanner error visible in the supplied production screenshot.

## Implied Goal

An operator should not be forced into a persistent paused state because one read-only Bol request fails transiently, and any genuine paused state must be unmistakable and actionable without weakening fail-closed package decisions.

## Scope

Add bounded transient recovery at the server-side Bol request boundary; retain strict validation and retry exhaustion behavior; make the browser's paused heading, hint, and empty decision panel truthful; test; deploy; and verify the current production artifact.

## Excluded Surfaces

Bol writes, credential or account configuration, Turso schema/data changes, auth/session behavior, snapshot completeness rules, scan verification rules, queue ordering, unrelated styling, and other projects/accounts.

## Affected Surfaces

| Surface | Expected Impact | Verification |
|---|---|---|
| `server/bol-client.mjs` | Retry transient transport, `408`, `425`, `429`, and `5xx` failures within a fixed budget; honor a bounded `Retry-After`; keep invalid data and exhaustion fail-closed. | Focused Node tests plus full server suite. |
| `index.html` | Replace ready/idle language with paused/actionable language only when scanning is actually blocked by unhealthy data. | Data-health tests and desktop/mobile screenshots. |
| `tests/server/bol-client.test.mjs`, `tests/data-health.spec.mjs` | Freeze recovery and state-truth contracts. | Focused and full test runs. |
| Production Vercel deployment | Release exact tested artifact. | Deployment identity, runtime logs, and current browser/API evidence. |

## Phases

| Step ID | Provenance | Required | Phase | Crux | Output | Verification |
|---|---|---:|---|---|---|---|
| P1 | required_dependency | yes | Retry boundary | Recover only safe transient failures without broadening accepted data. | Bounded transport/status retry in `BolClient`. | Unit tests for success after transient failure, exhaustion, `Retry-After`, `401`, and malformed `200`. |
| P2 | user_request | yes | Paused-state truth | Remove the visible contradiction in the supplied screenshot. | Translated paused heading, hint, and decision copy tied to actual unhealthy state. | Browser tests across NL/EN/ES plus current desktop/mobile inspection. |
| P3 | existing_contract | yes | Regression proof | Preserve FIFO, focus, auth, source isolation, and fail-closed behavior. | Passing migration check, server suite, and full browser suite. | Repository verification finish line. |
| P4 | user_request | yes | Release and outcome proof | Ship only after local proof, then verify the exact current deployment. | Commit, push, production deployment, logs/API checks, and browser evidence. | Exact deployment identity and validated visual outcome/adoption receipts. |

## Done Criteria

1. A transient read failure that succeeds within the bounded retry budget no longer pauses the scanner.
2. Persistent transport/status failure, malformed `200`, partial data, and identifier mismatch still fail closed without counting a parcel.
3. When the scanner is blocked, the heading, hint, status, input, flag, and empty decision panel all communicate paused state and the retry action; ready state returns only after a complete snapshot commits.
4. Local migration, server tests, full browser tests, desktop/mobile inspection, and the visual/adoption validators pass for the exact current artifact.
5. The approved production project serves the tested release and has direct post-deploy evidence; any missing authenticated browser session is reported as `unique_access_required`, never inferred.

## Verification Evidence

Run `npm run migrate:local`, focused Node tests, `npm run test:server`, and `npm run test:browser`. Capture current local paused and ready states at desktop and mobile widths, validate the exact local receipt, then commit/push/deploy and repeat exact production identity, log/API, and browser checks before validating the deployment-bound receipt and adoption manifest.

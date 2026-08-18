# Client issues 1-3 — implementation plan

Planning mode: formal, one named-risk review used before mutation.

Named risk: remembered Station/Operator metadata accidentally becomes reusable authentication, exposes the warehouse password, or weakens the password boundary.

Material review adjustment: preserve the current failed-revocation contract. When Turso revocation fails, keep the authentication cookie, set `ampere_logout_pending`, block normal session use, retain the preference, and clear authentication only after confirmed revocation.

## Acceptance ledger

| ID | Required outcome | Observable verification |
|---|---|---|
| A1 | Station/Operator prefill after a prior successful login | Signed preference is issued only on successful password login; later unauthenticated GET returns only validated remembered labels; browser fields prefill and remain editable |
| A2 | Password boundary unchanged | Password field stays blank; preference cannot authenticate; tampered/expired preference is ignored; session expiry still requires password |
| A3 | Failed logout remains fail closed | Revocation failure retains auth cookie, sets logout-pending, hides operational surface, and allows only retry; successful retry clears auth and keeps preference |
| A4 | Package-grain metrics | Total equals labelled shipment packages; Scanned and Awaiting scan partition non-cancelled labelled packages; No label and After cutoff remain order-grain metrics |
| A5 | Refresh and rollover durability | Accepted/cancelled state survives manual/automatic refresh, reload, second station, and the 16:00 workday transition while the same shipment is active |
| A6 | Duplicate safety | A package accepted before rollover remains duplicate and is never counted again after rollover; concurrent stations still produce one effective acceptance |
| A7 | Dynamic-account correctness | Valid `acct_*` source keys remain scoped and render accepted/cancelled state on their own tab |
| A8 | Existing safety preserved | bol verification, same-origin APIs, FIFO input, focus recovery, partial-data fail-close, and ampere-only persistence tests remain green |
| A9 | Visual completion | Exact current local artifact passes desktop/mobile inspection, touched state checks, console/overflow review, visual receipt validation, and adoption validation |
| A10 | Release proof | If local gates pass, exact commit/deployment is pushed/deployed to the approved project and production is checked without performing an unapproved package scan |

## Parallel workstreams

1. Auth preference: security primitives, session response/cookies, negative-path tests, and failed-logout preservation.
2. Browser projection: prefill behavior, dynamic account normalization, localized package metric definitions, and browser tests.
3. Durable operational state: bounded current/previous workday projection and cross-rollover atomic duplicate semantics in `ampere_*` state.

## Integration order

1. Land independent workstreams without overwriting unrelated or concurrent changes.
2. Reconcile session payload shape and backend operational-state response with the browser normalizer.
3. Add cross-surface tests covering the combined paths.
4. Run local migration/schema guards if schema changes occur, then server tests and full browser suite.
5. Capture and inspect current desktop/mobile states; repair and repeat until the latest artifact passes.
6. Validate project-local visual and adoption receipts.
7. Commit, push, deploy, and verify only after every local gate is green.

# Task Plan

Generated: 2026-08-11

## Literal Request

Separate the client Bol account into its own tab.

## Implied Goal

Warehouse operators must never treat the primary and client accounts as one combined operational queue.

## Scope

Add selected-source tabs and source-scoped rendering/scan identity over the existing two-source complete snapshot, then release and inspect the exact approved deployment.

## Excluded Surfaces

Credentials, Bol writes/settings, Turso migrations/data changes, third accounts, arbitrary account configuration, and other deployments are excluded.

## Affected Surfaces

`index.html`, the source-aware state projection, deterministic browser tests/fixtures, non-secret operating documentation, and verification artifacts are affected.

## Scope Boundary

This is a browser-visible source-separation release in the existing standalone Ampere scanner. It uses the exact already approved GitHub repository and Vercel `bol-ampere-scanning` project only. It excludes credentials, schema mutation, and Bol writes.

## Implementation

| Step ID | Provenance | Required | Work | Surfaces | Verification |
|---|---|---:|---|---|---|
| P1 | user_request | yes | Add an explicit fixed-source tab control whose primary tab is selected by default and whose switch is unavailable while a source-bound scan is resolving. | `index.html` | Deterministic keyboard/tab-selection assertions plus desktop/mobile review. |
| P2 | required_dependency | yes | Keep the existing complete two-source snapshot and its cross-source tracking-collision block, but derive a selected-source view for orders, shipments, tracking index, totals, accepted state, and cancellations after that complete snapshot validates. | `index.html` | Primary/client fixture rows and metrics remain isolated; an identical code across sources remains fail closed before scanning. |
| P3 | required_dependency | yes | Send only the selected fixed source with each scan and render the returned state source-aware. Keep accountless unknown/unverified STOP records in shared safety history instead of hiding them beneath a tab. | `index.html`, `server/application.mjs` | Scan request/response and STOP-history assertions. |
| P4 | existing_contract | yes | Update deterministic mock state and browser/server tests for source tabs, primary default, source-scoped queue/state, retained global collision fail-closed behavior, disabled switching while a decision is active, and healthy one-source fallback. | `tests/data-health.spec.mjs`, `tests/fixtures/mock-bol.mjs`, `tests/server/application.test.mjs` | `npm run test:server` and `npm run test:browser`. |
| P5 | existing_contract | yes | Describe account-tab operation without credentials; run repository checks; commit/push/deploy only the approved project; inspect the current deployed station at desktop and mobile. | `README.md`, `verification/**`, release metadata | Exact deployment identity, authenticated browser/API proof, validated VOR/adoption receipts. |

## Sequencing and Recovery

1. Validate the project-local design, state, spatial-priority, and interface-output contracts.
2. Implement source-scoped presentation and scan identity without changing server credentials or schema.
3. Run local browser/server suites and inspect source-specific test behavior.
4. Deploy only the reviewed commit to the approved project. If deployment or live data is unhealthy, keep scanning fail closed and retain the previous released artifact as rollback.
5. Capture current desktop/mobile evidence, validate all project-local receipts, then report the exact deployment.

## Non-Goals

Independent per-source refresh availability, a third account, retail mutations, and historical audit reattribution are intentionally not part of this release. Atomic snapshot health remains the current safety contract.

## Phases

1. Validate the project-local UI/state contracts and obtain the required formal plan PASS.
2. Implement selected-source tab, rendering, state, and scan boundaries.
3. Prove regressions locally, then release only the approved project.
4. Complete current authenticated browser inspection and validate all completion receipts.

## Done Criteria

1. Primary is selected first and Client Bol is available only as a separate source context.
2. Source-qualified orders, shipments, counts, accepted state, and cancellations never appear in the other source’s worklist.
3. The active tab is the scan account and source switching cannot race an in-progress decision.
4. Unknown/unverified packages remain STOP/non-counting and source-unqualified STOP history remains visible.
5. The approved released artifact has passing suites and current valid visual/adoption receipts.

## Verification Evidence

Run local migration/server/browser commands, capture source-specific browser assertions, deploy only the approved Vercel project, and validate desktop/mobile released evidence against the exact deployment.

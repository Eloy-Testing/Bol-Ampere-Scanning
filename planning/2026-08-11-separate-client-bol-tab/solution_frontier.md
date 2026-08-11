# Solution Frontier

Generated: 2026-08-11

## Blocker Classification

`context_gap` — no blocker is currently known. The existing runtime, released source keys, test fixture, approved project identity, and visual verification contract are all established. An authenticated browser session is needed only for final released proof.

## Safe Routes

| Route | Status | Next action |
|---|---|---|
| Local selected-source implementation | Available | Implement only reviewed paths after formal PASS. |
| Deterministic browser fixture | Available | Prove tab scoping and scan identity without live data. |
| Approved Vercel project | Available | Deploy only after all local checks pass. |
| Authenticated production browser | Conditional | Reuse authorized session; request no new credentials unless safe browser discovery fails. |

## Viable options

| Option | Outcome fit | Risk | Decision |
|---|---|---|---|
| Source tabs over the existing complete snapshot | Meets explicit separation while preserving released credential, API, migration, and global cross-source collision fail-closed contracts. | Requires careful selected-source state derivation and tests. | Chosen. |
| Decorative tabs that keep one combined list | Does not separate the operational context. | Operators can still scan or dispatch from a mixed worklist. | Rejected. |
| A separate client deployment | Exceeds the request and duplicates authentication/release surfaces. | Higher operational and account risk. | Rejected. |
| Independent cross-source same-code persistence | Would permit both sources to use the same tracking code. | Requires an approved migration and authoritative duplicate-key redesign. | Deferred. |
| A general user-managed account registry | Exceeds the fixed approved two-account scope. | Enlarges credential and authorization surface. | Rejected. |

## Chosen boundary

The tab is a source-selection safety control. It changes only what the operator can see and which already configured fixed source a source-bound scan references. It does not expose account identities, change credentials, or make a partial snapshot scannable.

## Decision

Proceed with selected-source UI and state isolation on the existing atomic snapshot. Do not broaden into per-source availability, schema, or credential work.

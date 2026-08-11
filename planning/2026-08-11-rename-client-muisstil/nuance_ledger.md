# Nuance Ledger

## Literal Request

Client name is Muisstil.

## Implied Goal

Correct the label operators use to select the already configured secondary source.

## Unacceptable Narrow Interpretation

Changing only one locale or the runtime label while leaving the static fallback, documentation, or assistive tab name as Client Bol; or renaming the `secondary` source key and altering credential/scan wiring.

## Chosen Interpretation

Use Muisstil as the current fixed label everywhere the operator sees the secondary account. Preserve internal source identity and all behavior.

## Explicit Exclusions

No secret/configuration, API, database, migration, retailer, or source-identity changes.

## Assumptions

- Muisstil is the exact user-authoritative spelling.
- A stable proper client name is intentionally not translated.

## Ambiguities

Historical planning and verification may retain the prior name as factual history; current product and operator guidance must not.

## Consequence-Aware Interpretation

| ID | Detail | Failure if missed | Plan response | Evidence |
|---|---|---|---|---|
| N1 | Static markup is visible before localization completes. | The old name flashes or remains when scripts fail. | Change the static fallback and every locale dictionary entry. | Source review and browser test. |
| N2 | `secondary` is a server-safe fixed source key, not a product name. | Renaming it could break scan routing or credential lookup. | Do not alter identifiers or API payloads. | Full regression suites and focused diff. |
| N3 | The label is an account-selection safety cue. | An inconsistent name could send an operator to the wrong queue. | Keep Muisstil in the existing visible/assistive tab control. | Live desktop/mobile inspection. |

## Verification Evidence Required

Current product copy says Muisstil, no current Client Bol labels remain, source key remains unchanged, suites pass, and the approved deployment shows Muisstil.

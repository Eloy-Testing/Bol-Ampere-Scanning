# Nuance Ledger

Generated: 2026-08-12

## Literal Request

Fix the error shown on the Ampere scanner.

## Implied Goal

Keep the warehouse scanning loop usable through ordinary transient read failures while preserving strict non-counting behavior for uncertain data.

## Unacceptable Narrow Interpretation

Hiding the error banner, enabling the input with incomplete data, accepting partial snapshots, or merely changing copy without addressing the repeated production `503` origin.

## Chosen Interpretation

Retry only retryable transport/status failures inside the server-only Bol client, with a fixed attempt cap and bounded delay. Keep all structural sanitization and identifier checks unchanged. Separately make the blocked browser state truthful and actionable.

## Explicit Exclusions

No write APIs, credential rotation, new telemetry product, auth changes, database work, new accounts, queue changes, or visual redesign beyond the paused-state contract.

## Assumptions

- The production `503` responses came from the existing server mapping of failed external Bol verification, not from the browser or Turso route.
- A successful subsequent complete production load is evidence that at least some observed failures were transient.
- Read-only token and Retailer API requests may be safely retried within a bounded budget.

## Ambiguities

| Ambiguity | Resolution |
|---|---|
| Should every failure be retried? | No. Retry transport and explicitly transient HTTP statuses only; malformed successful payloads remain immediate failures. |
| Should the browser silently enable scanning from stale data? | No. Existing complete/fresh snapshot rules remain unchanged. |
| Should the last real scan decision be replaced by paused copy? | No. Paused decision copy replaces only the empty idle decision; a real prior result remains visible. |
| Should retry details be exposed to the operator? | No. Product copy states impact and recovery; status codes and attempt mechanics remain internal. |

## Consequence-Aware Interpretation

First order: fewer false operational pauses from one transient read failure.

Second order: retry attempts increase upstream calls, so the budget and `Retry-After` bound must prevent request amplification.

Third order: strict tests keep future maintainers from turning recovery into silent partial-data acceptance.

## Verification Evidence Required

Production log correlation; transient/persistent/malformed unit cases; complete browser state coverage; full suites; exact local and deployed screenshots; and validated visual/adoption receipts.

# Nuance Ledger

Generated: 2026-08-11

Target surface: standalone Ampere warehouse scanner, approved Bol/Vercel/Turso accounts.

Applied layer: pragmatic intent plus underspecification analysis before action.

## Literal Request

Add a client Bol account with the supplied OAuth client credentials.

## Implied Goal

Scan both the existing and additional client account from one station without loss of current coverage.

## Unacceptable Narrow Interpretation

Replacing `BOL_CLIENT_ID` and `BOL_CLIENT_SECRET`, which would remove the existing account; or storing the supplied secret in code, browser state, tracked configuration, or logs.

## Chosen Interpretation

Keep the current pair as `primary`; introduce one optional fixed `secondary` pair (`BOL_SECONDARY_CLIENT_ID`, `BOL_SECONDARY_CLIENT_SECRET`). The secondary source is enabled only when both variables are supplied. Its non-secret fixed key follows records through the server but is not user-selectable.

## Explicit Exclusions

No arbitrary multi-tenant account registry, user-facing account picker, Bol writes/settings access, customer data expansion, legacy record backfill, or broader database schema changes.

## Assumptions

- Zander's direct credentials message authorizes this exact client account for the project's existing read-only Bol scope.
- The existing primary pair remains configured in Vercel and must remain enabled.
- Account keys are operational provenance, not Bol identity claims and not secrets.

## Ambiguities

| Ambiguity | Resolution |
|---|---|
| Does "as well" mean replace or retain? | Retain: the user used additive wording and the scanner must preserve current coverage. |
| Which source should a scan use? | The snapshot attaches a fixed server allowlisted key; the scan service rechecks the source-qualified shipment/order live. |
| What if a tracking code is present twice? | Treat it as ambiguous and stop scanning; do not pick a source. |
| Can an unavailable second account be ignored? | No; a complete combined snapshot is required before scanning. |
| Can the existing migration merely be edited? | No; deployed tables from `001` would not gain new columns. Use one ledgered `002` additive migration, while retaining `001`. |
| Which source belongs to an unknown code? | None. Persist null rather than falsely assigning the primary or secondary account. |

## Pragmatic Intent

One warehouse loop should see both current and client packages while continuing to reject uncertain, stale, or mismatched data.

## Consequence-Aware Interpretation

1st order: each data call and scan carries only a fixed non-secret source key.

2nd order: merged pagination must preserve completeness and ordering; persisted decisions need source attribution.

3rd order: operators cannot accidentally dispatch an account whose data was omitted, and future audit/recovery can distinguish the source without granting account selection.

## Verification Evidence Required

Dual-account fixtures, missing-pair and collision tests, local migration, credential token validation with no emitted token, Vercel/deployment identity, database readback limited to `ampere_*`, and deployed desktop/mobile interaction evidence.

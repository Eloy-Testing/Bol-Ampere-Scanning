# Decision Log

Generated: 2026-08-11

## Decisions

| Decision | Rationale | Evidence |
|---|---|---|
| Retain the current pair as primary and add one fixed secondary pair. | "As well" is additive; replacing the current variables would remove scanner coverage. | `server/config.mjs` currently has one pair. |
| Use `primary` and `secondary` as fixed non-secret source keys. | They support account-qualified read/verify/audit behavior without creating user-selectable account access or leaking real account identity. | Same-origin API and fail-closed runtime rules. |
| Fail closed if either configured account cannot produce a complete snapshot or a tracking code is ambiguous. | The scanner must not complete a package from partial or uncertain live data. | Project runtime and verification rules. |
| Store source provenance only on new source-qualified `ampere_*` decision/event records. | It is operational audit data and avoids touching non-`ampere_*` tables or backfilling history; unknown codes have no trustworthy account and remain null. | Project Turso boundary. |
| Use a ledgered `002` migration rather than editing only `001`. | The existing runner replays one create-only source, which cannot add a column to tables already created in production. | `scripts/migrate.mjs` and current `001` migration. |

## Rejected Options

| Option | Reason Rejected | Revisit Trigger |
|---|---|---|
| Replace `BOL_CLIENT_ID`/`BOL_CLIENT_SECRET`. | Violates additive user intent and removes current coverage. | Only an explicit request to retire the primary account. |
| Browser-stored credentials or account selection. | Violates server-only credentials and grants unnecessary control. | Never under current project contract. |
| General JSON account registry. | Unneeded flexibility creates larger secret/config/routing surface for one additional account. | Explicit request for further named accounts with revised review. |
| Ignore an unavailable secondary account. | Creates partial data that could wrongly permit dispatch. | Never under current fail-closed contract. |

## Revisit Triggers

- A further account, renamed operational source, or a request to retire primary.
- Evidence that Bol identifiers or pagination require a different account-qualified routing contract.
- A current authenticated browser session is unavailable for final deployed scan proof.

# Project Brief

Generated: 2026-08-11

## Target Surface

The standalone Ampere warehouse scan station in this repository, its `bol-ampere-scanning` Vercel project (`prj_dI9qXMRXVKDUekYqcZEVCmjry1fS` under `Zander's projects`), and only the approved `ampere_*` Turso schema.

## Ownership And Accounts

- bol Retailer API: retain the existing read-only account and add the additional client credential pair supplied directly by Zander for this scanner. Both remain server-only and read-only.
- Vercel: only `bol-ampere-scanning` in `Zander's projects`.
- Turso: only `bankhoes-bi-data-zanderbmc.aws-eu-west-1.turso.io` and `ampere_*` tables.
- GitHub: only `Eloy-Testing/Bol-Ampere-Scanning` through `ZanderBMC`.

## Source Of Truth

`AGENTS.md` governs ownership, runtime, secret handling, and verification. bol remains authoritative for orders, shipments, tracking identity, and cancellations; Turso remains scanner audit and operational state only.

## Affected Surfaces

| Surface | Role | Evidence |
|---|---|---|
| `server/config.mjs` | Validate the existing primary pair and one optional complete secondary pair. | Current config accepts exactly one pair. |
| `server/bol-client.mjs`, application and scan service | Read, select, and verify the right Bol account without exposing credentials. | Current application creates one `BolClient`. |
| `index.html` | Build one complete, account-qualified snapshot before enabling scanning. | Current browser loads an unqualified singleton API. |
| `ampere_*` schema/migration runner/repository | Preserve source-account attribution for source-qualified decisions through a numbered idempotent migration sequence. | The runner currently replays only `001`; state is keyed by workday and tracking code only. |
| Vercel project | Hold only server-side secondary credentials and run the released build. | Project identity confirmed through Vercel. |

## Excluded Surfaces

No Bol retailer writes, Ads API, account settings, other Vercel projects, other Turso tables, warehouse-auth changes, historical data backfill, browser storage for operational state, or additional client accounts.

## Known Constraints

The browser may call same-origin `/api/*` only. A partial account snapshot, ambiguous source, failed live check, or credential failure must fail closed. The supplied secret must never enter tracked files, artifacts, logs, browser responses, or planning documents.

## Verification Matrix

| Task Type | Required Evidence |
|---|---|
| Code and migration | Local migration, server suite, browser suite, and source-account/ambiguity regression coverage. |
| Auth/setup | Safe token validation without emitting token material, Vercel server-only secret configuration, and production runtime readback. |
| Release/browser | Exact deployment identity, authenticated scan flow covering both accounts, and current desktop/mobile visual inspection with a validated receipt. |

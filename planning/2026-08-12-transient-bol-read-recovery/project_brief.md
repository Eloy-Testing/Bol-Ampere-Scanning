# Project Brief

Generated: 2026-08-12

## Target Surface

The standalone Ampere warehouse scan station in this repository and the approved production Vercel project `bol-ampere-scanning` (`prj_dI9qXMRXVKDUekYqcZEVCmjry1fS`) at `https://bol-ampere-scanning.vercel.app/`.

## Ownership And Accounts

- Vercel: only `bol-ampere-scanning` in `Zander's projects` through `zanderbmc`.
- Bol Retailer API: only the two already approved read-only scanner sources. No Retailer API write is in scope.
- GitHub: only `Eloy-Testing/Bol-Ampere-Scanning` through `ZanderBMC`.
- Turso: no schema or data mutation is required for this fix; production readback remains limited to scanner health when needed.

## Source Of Truth

`AGENTS.md` governs runtime, account, release, and verification boundaries. Bol remains authoritative for orders, shipments, tracking identity, and cancellation state. The scanner must remain fail-closed when live data is persistently unavailable or structurally incomplete.

## Affected Surfaces

| Surface | Role | Evidence |
|---|---|---|
| `server/bol-client.mjs` | External token and Retailer API request boundary. | Current client retries one `401` but immediately fails on transient transport, `429`, or `5xx` responses. |
| `tests/server/bol-client.test.mjs` | Retry and fail-closed contract. | Existing tests cover `401`, malformed data, and persistent upstream failure, but not transient recovery. |
| `index.html` | Browser-visible loading, paused, ready, and decision states. | Current paused screenshot still labels the station ready and shows the idle decision. |
| `tests/data-health.spec.mjs` | Incomplete-snapshot browser contract. | Existing tests prove disabled input and retry visibility but not truthful paused copy. |
| Vercel deployment | Production runtime. | Production deployment `dpl_EsVLJdjVJcBN3a1srKyHs1bDWxuV` recorded intermittent `/api/retailer` `503`s followed by successful complete reads. |

## Excluded Surfaces

No Bol writes, credential changes, database migration, non-`ampere_*` database access, auth changes, account routing changes, scan-decision relaxation, or unrelated UI redesign.

## Known Constraints

Retries must be bounded and limited to transport failures and retryable HTTP statuses. Invalid successful responses, identifier mismatches, partial shipment data, and exhausted retries remain non-counting failures. Browser scanning stays disabled until a complete snapshot commits atomically.

## Verification Matrix

| Task Type | Required Evidence |
|---|---|
| Code | Unit coverage for transient recovery, retry exhaustion, `Retry-After`, malformed `200`, and existing `401` behavior. |
| Browser state | Full browser suite plus paused-state copy and recovery checks. |
| Visual | Current desktop/mobile inspection of paused and ready states with a validated exact-artifact receipt. |
| Release | Commit/push/deploy identity plus production API/log and authenticated browser evidence where authorized state is available. |

# Task Plan

Generated: 2026-08-12

## Literal Request

Allow manual API key entry and connection with Bol for internal integration management and additional client accounts, where each new account/credential becomes a new scanner tab.

## Implied Goal

The scanner owner can add or rotate Bol Retailer credentials without editing Vercel settings or source code, while every account retains a stable identity, credentials stay confidential, and scanning remains account-qualified and fail closed.

## Scope

Add an authenticated Bol connection manager; list non-secret account metadata; create and update connections with warehouse-password re-authentication; validate credentials live before save; encrypt at rest with a dedicated server key; audit changes; resolve environment fallbacks plus database overrides; support dynamic account keys through retailer reads, snapshots, scans, and source provenance; create one tab per connected account; migrate, test, deploy, and verify.

## Excluded Surfaces

Deletion/disabling, secret reveal/export, role/permission redesign, Bol writes/Ads/settings/intermediary OAuth, non-ampere data, automatic import of Vercel credentials, historical provenance backfill, and using an unapproved third live account during Codex verification.

## Affected Surfaces

| Surface | Expected Impact | Verification |
|---|---|---|
| Config and credential vault | Require a dedicated AES-256-GCM key and preserve exact credentials server-side. | Config, round-trip, tamper, AAD, and secret-scanner tests. |
| Bol account service/client | Merge static fallbacks and encrypted overrides, validate token/orders/shipments, reject duplicates, resolve dynamic clients. | Unit tests with synthetic Bol transport. |
| API/auth | Protected metadata GET and same-origin, re-authenticated POST/PUT with generic errors. | Application tests and response-shape inspection. |
| Turso migration/repository | Encrypted account/audit tables and unconstrained dynamic provenance columns. | Fresh/pre-003 migration, ampere boundary, atomic write/readback tests. |
| Browser UI | Compact manager and dynamic tab reconciliation in NL/EN/ES. | Browser tests, keyboard/focus, responsive screenshots, console. |
| Deployment | Encryption key, approved migration, release and live verification. | Exact project/account/deployment/schema/API/browser evidence. |

## Phases

| Step ID | Provenance | Required | Phase | Crux | Output | Verification |
|---|---|---:|---|---|---|---|
| P1 | user_request | yes | Interaction contract | Add contained authenticated management with list, add, update, states, and dynamic tabs. | Management dialog and one tab per account. | All-locale browser tests, keyboard/focus, mobile/desktop visual review. |
| P2 | required_dependency | yes | Secret boundary | Add dedicated AES-256-GCM vault with account-bound AAD and strict server configuration. | Confidential credential envelopes; no browser/response secret path. | Round-trip, tamper, wrong-account, malformed-key, source-secret scans. |
| P3 | required_dependency | yes | Account runtime | Merge fixed environment accounts with encrypted database overrides and generated stable dynamic keys; validate token plus required read endpoints before save. | Async account registry serving metadata and account-specific Bol clients. | Rejection/no-write, duplicate, create, update/fallback, cache/version tests. |
| P4 | required_dependency | yes | API and scan integration | Add protected integrations route; make retailer and scan resolution async/dynamic; preserve FIFO and fail-closed snapshot semantics. | Same-origin re-authenticated management and dynamic source routing. | Application/scan/browser tests including forged keys and session expiry. |
| P5 | existing_contract | yes | Schema and audit | Add ledgered `003` with encrypted account/audit objects and dynamic source columns, without touching non-ampere data or rewriting legacy rows. | Additive idempotent schema and auditable connection mutations. | Fresh/pre-003 local migration and exact schema/transaction readback. |
| P6 | existing_contract | yes | Release verification | Run full suites, set a non-disclosed dedicated encryption key in the approved Vercel project, migrate approved Turso, commit/push/deploy, inspect exact API and UI. | Production release bound to exact commit/deployment. | Vercel identity, migration output/readback, live metadata/API, current desktop/mobile receipt. |

## Done Criteria

1. An authenticated operator can view real connected account names, add a new account, or replace credentials for an existing account without seeing current secrets.
2. Every mutation requires same-origin session plus warehouse-password re-authentication, validates Bol token/orders/shipments first, and saves nothing on rejection or infrastructure failure.
3. Credentials are AES-256-GCM encrypted with a dedicated server-only key, account-bound AAD, and never returned, logged, stored in browser storage, or committed.
4. Primary/secondary environment accounts remain fallback sources; database overrides preserve `primary`/`secondary`; new accounts receive unique stable `acct_*` keys.
5. Every connected account appears as a correctly labelled tab and retailer/scan requests persist the exact dynamic source key without weakening FIFO, collision, or fail-closed rules.
6. Migration, server, browser, live schema/API, and current visual release evidence pass on the exact production deployment.

## Verification Evidence

Run contract validators, local migration twice, pre-003 upgrade, server tests, browser tests, secret/static checks, and `git diff --check`. Confirm Vercel identity before setting only the dedicated key name in Preview/Production, then apply only the approved `003` migration. Deploy the intended commit; verify exact deployment identity, authenticated connection metadata, existing Bankhoes/Muisstil scanner paths, dynamic-account behavior through deterministic tests, and current desktop/mobile manager/tab states. Do not submit an unapproved third live credential during verification.

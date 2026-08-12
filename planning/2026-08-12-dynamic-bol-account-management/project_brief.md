# Project Brief

Generated: 2026-08-12

## Target Surface

The standalone Ampere warehouse scanner in `/Users/zanderbrilleman/Documents/BHP Warehouse Packing Tracker`, its same-origin Vercel Functions, approved Bankhoes Turso `ampere_*` namespace, approved GitHub repository, and approved `bol-ampere-scanning` Vercel project.

## Ownership And Accounts

Bankhoes and Muisstil remain the only live Bol accounts used by Codex for release verification. The product may accept additional account credentials only through an authenticated, same-origin, re-authenticated management flow requested by Zander. It remains restricted to read-only Bol Retailer orders/shipments. No other external account surface is accessed by Codex.

## Source Of Truth

Bol owns order/shipment/tracking/cancellation truth. Turso owns encrypted scanner integration configuration, non-secret account metadata/audit, and scanner operational state only in `ampere_*` objects. Environment credentials remain the fallback bootstrap for Bankhoes and Muisstil. The browser owns no credential or operational persistence.

## Affected Surfaces

| Surface | Role | Evidence |
|---|---|---|
| `index.html` | Authenticated management dialog and dynamic tabs. | Browser state/interaction tests and screenshots. |
| `api/integrations.mjs`, `server/application.mjs` | Protected list/create/update connection API. | Same-origin, session, exact-body, re-auth, and response tests. |
| `server/bol-account-service.mjs`, `server/credential-vault.mjs`, `server/bol-client.mjs` | Validate, encrypt, resolve, and cache credentials/clients. | Unit tests for AES-GCM, no-secret output, rejection, duplicate identity, and fallback. |
| `server/repository.mjs`, migration `003` | Add encrypted account rows, audit rows, and dynamic source provenance. | Fresh/pre-003 migration and transaction readback tests. |
| Config/docs/deployment | Dedicated encryption key and operational runbook. | Config tests, secret-safe Vercel name readback, exact deployment. |

## Excluded Surfaces

Account deletion, disabling, importing historical accounts, secret reveal/export, role administration, Bol Ads/API writes/settings, intermediary OAuth, non-ampere tables, unrelated projects/accounts, and historical source-key backfill.

## Known Constraints

The scanner requires a complete, collision-free snapshot across all configured accounts before scanning. Every new credential is validated against the Bol token endpoint plus the required read-only orders and shipments pages before persistence. A dedicated 32-byte server encryption key must exist before the release is deployed.

## Verification Matrix

| Task Type | Required Evidence |
|---|---|
| Auth/secrets | Session and warehouse-password re-auth; no secret in response/source/logs/storage; AES-GCM integrity failure is closed. |
| Schema/data | Additive/idempotent local and approved live migration; only `ampere_*`; exact new objects/columns. |
| Code | Full server/browser suites plus focused integration/crypto/repository tests. |
| Visual | Current desktop/mobile manager list, form, error/success states, tabs, focus, overflow, console. |
| Release | Commit, push, exact Vercel project/deployment, live API metadata, database readback, deployed browser inspection. |

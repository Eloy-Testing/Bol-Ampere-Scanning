# Ampere Warehouse Scanner

Standalone, hands-free package scanning for bol.com fulfilment. The browser talks only to same-origin Vercel Functions; bol credentials, Turso credentials, password material, sessions, scan events, and shared package state stay server-side.

The operational loop is `start → scan → next → repeat`. Enter-terminated scanner input is cleared immediately and processed FIFO by one verifier. Unknown, cancelled, unverifiable, unauthenticated, database-failed, or partial-data states fail closed and never increase completion.

## Architecture

- `index.html` — responsive scanning station and secure login surface; no build step.
- `api/` — Vercel Functions for session, shared state, retailer reads, and authoritative scan decisions.
- `server/` — authentication, bol Retailer API, Turso, HTTP, and scan-domain modules.
- `migrations/` — ordered, idempotent additive schema migrations. Every app-owned object is prefixed `ampere_`.
- Turso database — the approved Bankhoes database at `bankhoes-bi-data-zanderbmc.aws-eu-west-1.turso.io`; existing non-`ampere_` tables are outside this app's contract.

bol.com remains the source of truth. The datastore contains normalized operational identifiers and audit metadata, not complete order/shipment/customer payloads or secrets.

## Two fixed Bol sources

When the optional secondary Bol credentials are configured, the station shows separate **Bankhoes** and **Muisstil** tabs. Bankhoes is selected first. Each tab has its own live orders, shipments, totals, accepted progress, and cancelled-package list; select the intended tab before scanning.

The station still requires one complete snapshot across both configured sources. A matching tracking code in both sources remains a global fail-closed collision, so neither tab may scan until that collision is resolved through an explicitly approved data-identity change. Unknown or unverified packages remain STOP items and are never counted.

## Required server environment

Copy `.env.example` to an ignored local environment file and set:

- `TURSO_DATABASE_URL` — the approved Bankhoes Turso URL.
- `TURSO_AUTH_TOKEN` — a server-side token that can create/use only the scanner schema where provider permissions allow.
- `BOL_CLIENT_ID` and `BOL_CLIENT_SECRET` — bol Retailer API credentials.
- `BOL_SECONDARY_CLIENT_ID` and `BOL_SECONDARY_CLIENT_SECRET` — optional fixed secondary bol Retailer API credentials. Configure both or neither; the scanner keeps the source account only in server-side operational audit state.
- `WAREHOUSE_PASSWORD_HASH` — the output of `npm run hash:password`, never the plaintext credential.
- `SESSION_SECRET` — at least 32 random bytes, for example output from `openssl rand -hex 32`.

Do not prefix these with `VITE_`, `NEXT_PUBLIC_`, or expose them in browser code. Do not commit `.env.local`, paste secrets into issues/logs, or store a browser bearer token.

## Local setup and verification

```sh
npm install
printf '%s' 'choose-a-strong-warehouse-password' | npm run hash:password
npm run migrate:local
npm test
```

`migrate:local` creates an ignored disposable libSQL database at `.data/ampere.db`. Automated tests use synthetic bol data and do not contact live bol or Vercel accounts.

To run the browser harness:

```sh
npm run serve:test
```

Then open `http://127.0.0.1:4188`. The test server is local-only and must not be deployed.

For repeatable visual evidence, keep that server running and execute this in a second terminal:

```sh
npm run capture:visual
```

This drives the real same-origin application handlers against a disposable local database and writes the login, desktop GO, and mobile STOP screenshots under `verification/screenshot-evidence/`.

## Approved Turso migration

First inspect the numbered migrations (currently `001_ampere_scanner.sql` and `002_ampere_source_account.sql`), run the local migration and complete test suite, and confirm every created object begins with `ampere_`. Then use the already approved Bankhoes Turso environment without copying its token into this repository:

```sh
node --env-file='../Bankhoes BI Dashboard/.env.local' scripts/migrate.mjs
```

The migration is additive and idempotent. Stop if the resolved database host is not `bankhoes-bi-data-zanderbmc.aws-eu-west-1.turso.io`. Do not query, change, or depend on existing non-`ampere_` Bankhoes tables.

## Vercel setup

1. Import this repository into the intended Vercel project.
2. Add the six required server environment variables above to the intended Preview/Production scopes. When the secondary bol source is enabled, add its two variables together to both scopes; neither source credential may be exposed to the browser.
3. Run the approved migration outside the build step; deployments must never migrate automatically.
4. Deploy from the intended commit, then verify login, session expiry/logout, shared-state hydration, one GO scan, duplicate behavior, STOP behavior, reload persistence, and a second station. When configured, prove each bol source loads independently and that a failed source blocks the combined snapshot.
5. Rotate the temporary warehouse credential by generating a new scrypt hash and replacing `WAREHOUSE_PASSWORD_HASH`; rotate `SESSION_SECRET` to invalidate all sessions when required.

No Vercel project/account is accessed by this repository's verification workflow. Account identity and release authority must be confirmed before deployment.

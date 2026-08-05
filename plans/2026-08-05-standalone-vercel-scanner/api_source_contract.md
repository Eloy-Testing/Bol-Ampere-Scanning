# Standalone API Source Contract

## Primary sources checked on 2026-08-05

- bol Retailer API authentication: <https://api.bol.com/retailer/public/Retailer-API/authentication.html>
- bol Retailer API conventions and pagination: <https://api.bol.com/retailer/public/Retailer-API/conventions.html>
- bol Retailer API v10 reference: <https://api.bol.com/retailer/public/redoc/v10/retailer.html>
- bol orders and shipments flow: <https://api.bol.com/retailer/public/Retailer-API/v10/functional/retailer-api/orders-shipments.html>
- Vercel Functions: <https://vercel.com/docs/functions>
- Vercel environment variables: <https://vercel.com/docs/environment-variables>
- Turso TypeScript client reference: <https://docs.turso.tech/sdk/ts/reference>
- Turso Next.js/server environment guide: <https://docs.turso.tech/sdk/ts/guides/nextjs>

## Frozen upstream contract

- Direct retailer software uses OAuth 2.0 Client Credentials.
- Access tokens come from `POST https://login.bol.com/token` with Basic authentication, `Accept: application/json`, `Content-Type: application/x-www-form-urlencoded`, and `grant_type=client_credentials`.
- Tokens are short-lived (`expires_in` is normally 299 seconds) and are sent as `Authorization: Bearer <token>`.
- The Retailer API base URL is `https://api.bol.com/retailer`.
- v10 is requested through `Accept: application/vnd.retailer.v10+json`.
- `GET /orders` and `GET /shipments` use 1-based `page` pagination with 50 records per page; clients continue until an omitted/empty collection proves the boundary.
- The scanner needs read-only access to exactly four shapes: order list, order detail, shipment list, and shipment detail.
- Credentials must not be hardcoded or sent to the browser.
- The existing Bankhoes dashboard uses `@libsql/client` with `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` against `bankhoes-bi-data-zanderbmc.aws-eu-west-1.turso.io`.
- Turso documents `client.batch(statements, "write")` as a sequential implicit transaction that commits all statements or rolls all changes back.

## Local application contract

- The browser calls same-origin `/api/session` and `/api/retailer` only.
- `/api/session` owns scrypt password-hash verification, Turso-backed lockout, audited sessions, and a signed, HttpOnly, Secure, SameSite=Strict cookie.
- `/api/retailer` rejects unauthenticated requests and allowlists only `orders` or `shipments`, an optional validated identifier, and page 1-100.
- `/api/state` hydrates shared workday package state from Turso; `/api/scan` independently rechecks known shipment/order data through bol and records every terminal result transactionally.
- Only isolated `ampere_*` tables store normalized operational identifiers, result/reason, workday, timestamps, and station/principal/session audit metadata. They do not store bol secrets or full retailer payloads.
- Server-side runtime environment names are `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BOL_CLIENT_ID`, `BOL_CLIENT_SECRET`, `WAREHOUSE_PASSWORD_HASH`, and `SESSION_SECRET`.
- Synthetic test endpoints and base-URL overrides are accepted only when `NODE_ENV=test`.
- Auth or database failure returns a fail-closed result. Upstream failures return generic, non-secret application errors; no token, client secret, password hash, connection string, upstream body, or customer payload is logged.

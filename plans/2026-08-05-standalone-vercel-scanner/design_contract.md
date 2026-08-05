# Standalone Vercel Scanner Design Contract

## Runtime boundary

The production artifact is `index.html` plus same-project Vercel Functions and shared Turso state. The frontend must contain no CoWork metadata, MCP tool names, `window.cowork` access, bol client ID, bol client secret, Turso URL/token, password/password hash, session secret, or browser-stored bearer token.

The server owns:

- bol OAuth token acquisition and short-lived in-memory reuse;
- the four allowlisted read shapes needed by the scanner;
- scrypt password-hash verification, database-backed rate limiting/lockout, an audited database session, and a signed HttpOnly session cookie;
- same-origin and Fetch Metadata checks for session and scan mutations;
- shared workday package state plus append-only scan-event persistence;
- independent shipment-code and order-cancellation verification for known scans;
- request validation, bounded timeouts, no-store responses, and generic error mapping.

## Interaction contract

1. On load, the app checks `/api/session` through the same origin.
2. An authenticated Turso-audited session reveals the station, hydrates shared workday state, and begins an atomic bol data refresh.
3. An unauthenticated session presents constrained station/operator audit labels, one password field, and one submit action, with focus on the first required field.
4. Successful sign-in reveals the scanner. Once shared state and a complete bol snapshot are healthy, focus moves to the scan input.
5. Expired/invalid sessions, lockout, or database unavailability fail closed, hide the operational surface, clear the in-memory snapshot/queue, and return focus to the access gate.
6. Sign-out revokes the database session, clears the cookie, and returns to the gate.
7. Inside the station, FIFO ordering, synchronous input clear, duplicate reservation, and GO/STOP rules remain. The client sends known scans to `/api/scan`; the server independently confirms shipment identity and relevant order items, transactionally records the event/current package state, and returns the decision.
8. Unknown codes are refreshed once against a complete bol snapshot, then recorded as an unknown finding through `/api/scan`; no browser claim can create an accepted result.
9. Reloads and additional stations hydrate accepted, cancelled, unknown, and unverified state from `/api/state`; operational completion state is never sourced from localStorage.

## Durable Turso data contract

- A checked idempotent migration creates only `ampere_*` station/principal/session audit, shared auth-attempt/lockout, append-only scan-event, and canonical workday package-state tables in the approved Bankhoes Turso database.
- An atomic libSQL write batch serializes the effective result for `(workday, tracking_code)`, records every attempt, prevents accepted packages from being counted twice across stations, permits later cancellation to override acceptance, and never lets unknown/unverified downgrade a terminal accepted/cancelled state.
- Stored fields are limited to normalized tracking/order/shipment identifiers, outcome/reason, Amsterdam workday, station/principal/session identifiers, request ID, and timestamps.
- Full bol order/shipment/customer payloads, OAuth tokens, client secrets, password material, and raw source addresses are excluded.

## Security contract

- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BOL_CLIENT_ID`, `BOL_CLIENT_SECRET`, `WAREHOUSE_PASSWORD_HASH`, and `SESSION_SECRET` exist only in server environment variables.
- The shared password is stored as a versioned salted scrypt hash. Verification and token-signature comparison are timing safe.
- Login failures and lockouts are keyed by an HMAC of the source address and persisted in Turso; successful sessions are audited and revocable.
- Session cookies contain a random opaque token plus an HMAC signature, while Turso stores only its hash. Sessions expire after a bounded interval; cookies use `HttpOnly`, `Secure` in production, `SameSite=Strict`, `Path=/`, and a bounded `Max-Age`.
- Every API route verifies the database session. Mutating requests validate Origin and Fetch Metadata; logout revokes the session before clearing the cookie.
- `/api/retailer` is GET-only and accepts `resource=orders|shipments`, `page=1..100`, and an optional constrained identifier.
- `/api/scan` never accepts an `accepted` outcome from the browser. Known scans must include a validated shipment ID; the server reloads shipment detail, verifies the normalized tracking code, reloads order detail, scopes cancellation to shipment items, then commits the result through one transaction.
- The upstream client sends v10 Accept headers, a non-personal User-Agent, and an OAuth Bearer token. One upstream 401 invalidates the cache and retries once.
- Auth, database, or verification uncertainty returns a non-counting fail-closed result. Secrets and raw upstream response bodies are never emitted in application errors.
- HTML and API responses are no-store and carry restrictive security headers appropriate to the inline single-file UI.

## State and copy contract

- The access gate has checking, signed-out, submitting, invalid-credentials, locked, configuration-unavailable, database-unavailable, expired, and recovered states.
- User-visible messages explain impact and recovery without raw API, OAuth, Turso, Vercel, MCP, stack, credential, or test details.
- Login status uses a polite live region; scan decisions remain assertive and non-color dependent.
- The language choice may remain a local browser preference. No operational package state, user identity, session token, password, or credential is persisted in web storage.

## Verification contract

- Server unit tests cover scrypt verification, session signing/expiry/revocation, safe cookie attributes, shared lockout, same-origin enforcement, route allowlisting, token caching/retry, transactional scan decisions, configuration/database failure, and secret-safe errors.
- Browser tests use same-origin synthetic HTTP responses, not a CoWork shim.
- One full local journey uses the actual session, state, retailer, and scan handlers against a disposable local libSQL file and local synthetic bol upstream: sign in, hydrate, load, scan, live verify, persist, reload, and observe the shared GO state.
- Existing pagination, DST, refresh, XSS, FIFO, duplicate, cancellation, focus, and mobile assertions continue to pass after migration from local operational state.
- Main-session visual inspection captures current desktop and mobile login/ready evidence after the last code change.
- The Bankhoes Turso identity is approved only for additive `ampere_*` schema/state. Live Vercel and bol access remain excluded until their account identities are approved.

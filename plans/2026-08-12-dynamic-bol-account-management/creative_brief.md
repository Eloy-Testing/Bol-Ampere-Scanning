# Creative Brief

## Task

- Request: Add authenticated manual Bol credential management and create a scanner tab for every connected account.
- Target surface: Existing Ampere operational scanner plus a contained Bol connection-management dialog.
- Owner/project: BHP Warehouse Packing Tracker.
- Explicit exclusions: Scanner redesign, Bol writes, account deletion, customer-data display, secret reveal, and unrelated administration.

## User And Moment

- Primary user: An authenticated warehouse operator or owner configuring scanner integrations.
- User state of mind: They need to connect or rotate an account without touching deployment settings or source code.
- Job to be done: Enter an account name and Bol client credentials, prove the connection works, and immediately receive a usable account tab.
- Primary action: Connect account.
- Secondary actions: Open management, choose an existing account to update, cancel, close, and return to scanning.

## Design Intent

- What should feel immediately obvious: Existing connected accounts and the single Add account action.
- What should feel deliberately quiet: Encryption details, credential origin, timestamps, and technical integration mechanics.
- What should the user trust: Secrets are accepted once, never displayed again, and nothing is saved until Bol accepts the connection.
- What should the user ignore: Deployment variables, internal source keys, token flow, database columns, and tests.

## Content Truth

- Real data available: Server-returned non-secret account key, label, type, and last verification time.
- Sample data allowed: Synthetic account credentials and labels in automated tests only.
- Unknowns: A third live client account is not available for release-path creation testing.
- Claims that need verification: Credential rejection saves nothing; successful connection produces a new tab; existing account updates preserve the stable source key.

## Constraints

- Existing brand/system constraints: Preserve the compact dark scan station, cyan action color, existing tokens, and operational density.
- Technical constraints: One static HTML entry, same-origin APIs, HttpOnly session, encrypted server-side persistence, no browser storage, dynamic source keys, additive migration.
- Accessibility constraints: Native dialog semantics, labelled fields, visible validation and recovery, keyboard close/cancel, predictable focus return.
- Browser/device constraints: Desktop around 1440x980 and mobile around 390x900 with no horizontal overflow.

## Acceptance Criteria

- Primary flow is visible without explanation: yes.
- Visual hierarchy has one dominant focal area: account connection form after Add account is chosen.
- No fake debug or integration content appears in the product: required.
- Important states are represented: loading, existing list, adding, updating, checking, success, rejected, unavailable, re-authentication failure, and session expiry.
- Current browser visual evidence is captured before final delivery: required.

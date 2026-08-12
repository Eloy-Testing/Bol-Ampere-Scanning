# Design Contract

## Retrieval Contract

- File: `plans/2026-08-12-dynamic-bol-account-management/retrieval_contract.json`
- Included pages: Current scanner source, server auth/Bol/database boundaries, migrations, tests, official Bol authentication docs.
- Excluded pages: Other projects/accounts, non-ampere tables, Bol write surfaces, secrets, and customer data.
- Active skills: Creative brief, surface classifier, flow priority, spatial priority, state contract, formal plan review, visual outcome review.
- Page faults: No third live client credential is available; production creation is therefore not exercised with a new external account.

## Cognition Records

- Assumption ledger: `planning/2026-08-12-dynamic-bol-account-management/nuance_ledger.md`
- Altitude map: Interface, API, encrypted configuration, source identity, migration, release.
- Step ledger: `planning/2026-08-12-dynamic-bol-account-management/task_plan.md`
- Unresolved decision: None blocking; account deletion is explicitly deferred.

## Surface

- Surface: Internal operational tool and contained connection-management dialog.
- Primary standard: Speed, legibility, secure error recovery, and boring reliability.
- User moment: An authenticated operator needs to connect or rotate one Bol account without leaving the scanner.
- Dominant action: Connect account.
- Risk if designed generically: A settings-heavy screen could compete with scanning, expose secrets, or make connection success ambiguous.
- Design bias: Compact modal workflow using existing scanner tokens and native dialog behavior.

## Hierarchy

- Primary focal area: Connected-account inventory, then the selected credential form.
- Primary action: Add account / Connect account.
- Secondary actions: Update credentials, cancel, close.
- Deliberately quiet elements: Account type, last verification time, privacy note.
- What must not appear: Secret values after submission, tokens, raw upstream errors, database/encryption mechanics, customer data, or internal source keys.

## Spatial Priority

- Contract file: `plans/2026-08-12-dynamic-bol-account-management/spatial_priority_contract.json`
- Validation command: `node /Users/zanderbrilleman/Documents/Codex/2026-07-06/co/verification/validate-spatial-priority-contract.mjs <contract>`
- Primary decision zone: Dialog inventory and form region.
- Explicit placements: Account inventory, credential form, connect action, safe close/cancel.
- Implicit placements: Concise credential privacy note.
- Attention sequence: Current accounts → add/update choice → fields → connect → result.
- Focus sequence: Add/update action → fields → connect → cancel/close.
- Mobile invariants: Same DOM/task order, full-width form controls, no horizontal overflow, no scanner focus behind the dialog.

## Interface Output

- Contract file: `plans/2026-08-12-dynamic-bol-account-management/interface_output_contract.json`
- Interface output producers: applicable.
- Event origins: User-opened management, submitted connection, Bol rejection, duplicate identity, re-authentication failure, infrastructure failure.
- Presentation owners: Product owner for actionable states; none for internal helpers.
- Visible channels: Loading, checking, connected, rejected, duplicate, re-authentication, unavailable, privacy expectation.
- Assistive channels: Dialog labels and polite status updates; errors remain readable without raw technical data.
- Telemetry-only channels: Crypto, token, cache, query, migration, and validation internals.
- External behavior proof: Server tests, browser tests, current screenshots, console inspection, response-shape checks.

## Flow

1. First impression: Scanner remains the dominant operational surface; Bol connections is a compact authenticated utility.
2. Orientation: Dialog shows the real connected account names and one Add account action.
3. Primary decision: Add a new account or update an existing one.
4. Action: Enter account name where applicable, client ID, client secret, current warehouse password, then Connect account.
5. Confirmation or next step: Success says the tab is available; close and select it after the data refresh. Failure states say nothing was saved and how to recover.

## Visual System

- Specialized profile: none.
- Profile contract: not applicable.
- Target platform and implementation route: Existing static HTML/CSS/JS scanner and same-origin APIs.
- Profile availability deviations: none.
- Layout pattern: Native modal dialog with compact inventory rows and a single-column form.
- Density: Operational and compact.
- Type roles: Existing headings, labels, muted supporting copy, mono only for scanner codes—not credentials.
- Color roles: Existing navy/cyan primary actions, green connected state, red actionable error, neutral borders.
- Component contracts: Utility button, native dialog, account row, status badge, labelled input, primary/secondary action row, live status.
- Asset strategy: No new image assets.

## State Contract

- Loading: Account inventory loading with actions disabled.
- Empty: Not reachable while primary exists; tests still validate graceful no-managed-client state.
- Error: User-actionable generic recovery; no raw provider or storage details.
- Success: Connected account name and tab availability.
- Partial data: Nothing is persisted unless Bol authentication and required Retailer reads both pass.
- Permission blocked: Session required plus warehouse-password re-authentication for every credential mutation.

## Verification

- Visual checklist required: yes.
- State checklist required: yes.
- Browser or artifact target: Local deterministic states and exact deployed production alias.
- Evidence path: `verification/2026-08-12-dynamic-bol-account-management-*` and `verification/screenshot-evidence/`.
- Adoption manifest: `plans/2026-08-12-dynamic-bol-account-management/adoption_manifest.json`.

# Nuance Ledger

Generated: 2026-08-12

Target surface: Ampere scanner Bol integration manager and dynamic account runtime.

Applied layer: pragmatic intent plus underspecification analysis before action.

## Literal Request

Allow manual API key entry and Bol connection for internal management and additional client accounts; each new account/key produces a tab.

## Implied Goal

Remove code/deployment work from routine account onboarding and credential rotation without turning the browser into a secret store or breaking account-qualified scan truth.

## Unacceptable Narrow Interpretation

Adding a client ID field that stores plaintext, exposes secrets back to the browser, changes only the tab UI, supports only one extra account, skips Bol validation, or maps dynamic tabs to the wrong source.

## Chosen Interpretation

“API key” is the Bol OAuth client ID and client secret pair. Management means list/add/update; deletion is excluded. Existing Bankhoes/Muisstil keys can be replaced by encrypted database overrides while their environment pairs remain fallback. New accounts receive stable generated source keys and visible operator-supplied names.

## Explicit Exclusions

Delete/disable, roles, credential reveal/export, Bol writes/Ads/settings, intermediary OAuth, non-ampere data, historical backfill, unrelated external accounts, and a live third-account creation during Codex release verification.

## Assumptions

The warehouse password is the only existing management re-authentication factor. The approved Turso `ampere_*` boundary includes encrypted scanner integration configuration and audit. A dedicated encryption key can be added to the approved Vercel project before deploy.

## Ambiguities

| Ambiguity | Resolution |
|---|---|
| “API key” singular | Use the required Bol client ID + client secret pair and name both fields clearly. |
| “Internal integration management” | Show Bankhoes/Muisstil and allow credential replacement without revealing current values. |
| “More client accounts” | Support bounded arbitrary dynamic accounts through generated stable keys, not another fixed env slot. |
| Delete/rename | Permit label editing during credential replacement for dynamic accounts; defer deletion. |
| Production creation proof | Use synthetic transport/integration tests and production list/form inspection; do not access an unapproved third Bol account. |

## Pragmatic Intent

One operator-facing workflow should connect credentials, verify access, persist securely, and make the account selectable without redeploying again.

## Consequence-Aware Interpretation

1st order: New UI/API/schema/crypto/runtime routing and account metadata.

2nd order: Dynamic source provenance must escape the legacy primary/secondary CHECK, duplicate credentials/tracking identities must remain blocked, and async resolution must preserve scan FIFO.

3rd order: Environment credentials remain rollback, database loss/corruption fails closed, no UI can recover lost secrets, and future account growth increases complete-snapshot load while preserving the existing safety rule.

## Verification Evidence Required

Crypto integrity, no-secret paths, re-auth, live-validation-before-write, duplicate prevention, stable-key update, dynamic provenance, migration upgrade, full tests, approved deployment/schema/API, and current visual/focus/console evidence.

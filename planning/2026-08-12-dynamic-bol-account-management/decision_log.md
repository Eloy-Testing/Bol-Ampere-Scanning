# Decision Log

Generated: 2026-08-12

## Decisions

| Decision | Rationale | Evidence |
|---|---|---|
| Use a client ID plus client secret form. | Bol Retailer API client-credentials authentication requires both; “API key” is user shorthand. | Official Bol authentication docs and current `BolClient`. |
| Store credential pairs as AES-256-GCM envelopes with account-bound AAD. | Shared serverless configuration needs durable confidentiality and tamper detection without browser exposure. | Vercel/Turso architecture and secret boundary. |
| Add a dedicated encryption key rather than reuse `SESSION_SECRET`. | Separation limits cross-purpose compromise and permits independent rotation. | Security design dependency. |
| Keep primary/secondary environment credentials as fallback; DB records override them. | Existing accounts continue through rollback and stable source keys survive rotation. | Current config and scan provenance. |
| Generate opaque `acct_*` dynamic keys, independent from labels. | Renames must not change source identity or audit continuity. | Prior Muisstil label/source-key separation lesson. |
| Require warehouse-password re-authentication for every credential write. | The station session may be left open; secret mutation deserves a fresh existing factor. | Current shared-password auth model. |
| Validate token plus orders and shipments reads before persistence. | Token success alone does not prove the exact Retailer read surface required by the scanner. | Current runtime dependency and Bol docs. |
| Defer deletion/disable. | Destructive lifecycle and scan-history semantics were not requested. | User scope and recoverability boundary. |
| Preserve aggregate fail-closed snapshot semantics. | The existing scanner requires one complete collision-free configured-account snapshot; changing it is a separate operational policy. | README and browser implementation. |

## Rejected Options

| Option | Reason Rejected | Revisit Trigger |
|---|---|---|
| Store plaintext credentials in Turso | Violates credential boundary and makes DB exposure sufficient to access Bol. | Never under current rules. |
| Store credentials in browser/localStorage | Violates same-origin server-only secret rule and shared operation. | Never under current rules. |
| Create one new Vercel env slot per client | Requires redeploy/config access and remains fixed-count. | Only as emergency rollback for a named account. |
| Use `SESSION_SECRET` for encryption | Cross-purpose coupling and unsafe rotation. | Only with explicit migration design, not this release. |
| Replace existing env credentials outright | Removes rollback and risks locking both known integrations. | After an explicit environment-retirement migration. |
| Add account deletion now | Destructive and linked to historical provenance. | Separate request with lifecycle/rollback contract. |

## Revisit Triggers

Add per-account snapshot isolation when operations require healthy accounts to continue while another connection is down. Add roles or a separate admin factor when scanner operators should not manage integrations. Add key rotation/versioning when the credential-encryption key must change without re-entering every account.

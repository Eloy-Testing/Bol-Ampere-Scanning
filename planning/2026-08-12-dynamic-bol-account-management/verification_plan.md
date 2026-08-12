# Verification Plan

Generated: 2026-08-12

## Task Classification

Formal auth/secrets + schema migration + code + visual user-facing + release/deployment.

## Required Evidence

| Finish Line | Evidence Required | Status |
|---|---|---|
| Secret handling | Dedicated key validation, AES-GCM round-trip/tamper/AAD, no secret response/browser/log/source. | Pending |
| Auth/setup | Session, same-origin, warehouse-password re-auth, invalid/expired paths. | Pending |
| Schema/data | Fresh and pre-003 migration, idempotency, ampere-only objects, exact account/audit/provenance readback. | Pending |
| Account runtime | Static fallback, create/update, duplicate, live-validation-before-write, dynamic key routing. | Pending |
| Browser | List/add/update/loading/success/error, new tab, localization, keyboard/focus, mobile/desktop, console. | Pending |
| Release | Approved GitHub/Vercel/Turso identities, key name configured without value output, exact commit/deploy/schema/API. | Pending |
| Visual outcome | Current artifact-bound desktop/mobile evidence, no findings, validated receipt and adoption manifest. | Pending |

## Commands Or Tools

| Command Or Tool | Purpose | Expected Signal |
|---|---|---|
| Contract validators | Freeze interface/spatial/planning contract. | All valid. |
| `npm run migrate:local` twice | Fresh/idempotent schema. | Only ampere objects; stable count. |
| Targeted Node tests | Vault, registry, repository, application, config, Bol. | All pass with synthetic credentials. |
| `npm run test:server` | Complete server behavior. | All pass. |
| `npm run test:browser` | Complete UI/scan behavior. | All pass. |
| `git diff --check` and secret scans | Hygiene and disclosure prevention. | No whitespace issues or secret values/names in browser output. |
| Approved Turso migration/readback | Release schema. | `003` ledgered; exact ampere objects/columns; no non-ampere access. |
| Vercel CLI on linked project | Configure key, deploy, inspect. | Correct owner/team/project, exact READY deployment. |
| Approved browser | Exercise current manager and tabs. | Desktop/mobile/focus/overflow/console pass. |
| Visual/adoption validators | Bind exact current deployment/source. | PASS. |

## Acceptance Criteria

All six task-plan done criteria pass. Failed validation, re-authentication, encryption, database, session, or account lookup saves nothing and never enables scanning. Production verification uses no unapproved third Bol account.

## Blocked Verification

| Check | Blocker Classification | Next Safe Route |
|---|---|---|
| Third live-account creation on production | permission_boundary | Use synthetic end-to-end tests; verify production manager/list and existing approved account tabs. Connect a named account only when explicitly supplied/approved. |

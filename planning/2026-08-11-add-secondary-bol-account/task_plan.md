# Task Plan

Generated: 2026-08-11

## Literal Request

Add an additional client Bol account using the credentials Zander supplied in this task.

## Implied Goal

The station must continue to scan the current Bol account while it also includes and live-verifies shipments from the newly supplied client account. The second account must not weaken fail-closed behavior or disclose credential material.

## Scope

Add a named, server-only secondary OAuth pair; make list/detail/scan operations account-qualified; persist non-secret account provenance with scan state; configure the pair on the approved Vercel project; and release and verify the resulting scanner.

## Excluded Surfaces

Replacing the current Bol account, adding arbitrary account selection, Bol writes, retrieving or changing Bol account settings, unrelated repositories/accounts, non-`ampere_*` database access, and historical record migration.

## Affected Surfaces

| Surface | Expected Impact | Verification |
|---|---|---|
| `AGENTS.md`, `.env.example`, `README.md` | Declare the directly approved secondary account scope and document blank server-only variables and numbered ampere migration behavior. | Secret scanner and documentation review. |
| Config and Bol client boundary | Require a complete secondary pair when either secondary variable is present; expose only fixed internal account keys. | Configuration tests. |
| API, scan service, browser snapshot | Enumerate configured accounts, fetch every account completely, retain account key through detail lookup and scan verification, and halt on source/track ambiguity. | Server and browser tests with two fixture accounts. |
| Migration runner/repository | Apply a numbered, ledgered, idempotent additive migration and source-account provenance only for source-qualified `ampere_*` state/event rows; unknown scans retain null provenance. | Fresh and pre-`002` local schemas plus repository tests. |
| Vercel release | Set two secondary credentials as server-only Production/Preview variables, migrate approved schema, deploy intended commit. | Vercel identity, deployment, API/database readback. |

## Phases

| Step ID | Provenance | Required | Phase | Crux | Output | Verification |
|---|---|---:|---|---|---|---|
| P1 | user_request | yes | Authority and contract | Record the direct approval narrowly; never persist the secret. | Updated allowed-account boundary and blank variable names. | Diff contains no credential value; account scope stays read-only. |
| P2 | required_dependency | yes | Runtime implementation | Add a fixed primary/secondary account pool and account-qualified API/scan path. | Complete merged snapshot and live verification against its selected account. | Unit tests cover both sources, missing-pair rejection, and ambiguous source failure. |
| P3 | required_dependency | yes | Operational attribution | Replace one-file replay with a strict numbered `ampere_*` migration sequence, then add nullable provenance columns and repository plumbing. | Account key on source-qualified decisions/events; null for unknown scans. | Fresh and pre-`002` local schemas migrate idempotently; no non-`ampere_` SQL. |
| P4 | user_request | yes | Protected release | Configure supplied pair on exactly the approved Vercel project, apply approved migration, commit/push/deploy. | Released secondary-account support. | Secret-safe Vercel readback, exact deployment, live auth/token/scan evidence. |
| P5 | existing_contract | yes | Outcome verification | Exercise primary and secondary fixtures plus current desktop/mobile scanner surface. | Current artifact-bound acceptance record. | Full tests and validated visual receipt for deployed artifact. |

## Done Criteria

1. Both configured accounts participate in a complete snapshot and each scan is verified only against the account that supplied its shipment.
2. Missing/partial credentials, an incomplete account, duplicate tracking code across accounts, or a failed verification produce a non-counting fail-closed result.
3. The database records a fixed non-secret source key on new source-qualified scan state/event rows (and null for unknown scans) through a numbered idempotent migration sequence without touching non-`ampere_*` tables.
4. The additional pair is present only as server-side Vercel secrets in the approved project; no secret value is tracked or emitted.
5. The deployed scanner passes the repository and visual finish lines.

## Verification Evidence

Run local migration, `npm run test:server`, `npm run test:browser`, and the project visual capture/inspection path. Before release, validate the new credential pair against the Bol token endpoint without printing response bodies. After release, record Vercel project/deployment identity, validate the released configuration without secret readback, inspect the approved database's `ampere_*` schema/row attribution, and exercise the current desktop/mobile scanner through an authenticated session. If that session cannot be established from existing authorized state, classify it as `unique_access_required` rather than infer success.

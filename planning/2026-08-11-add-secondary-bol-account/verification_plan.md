# Verification Plan

Generated: 2026-08-11

## Task Classification

Formal auth/setup, additive schema, code, release, and browser-visible operational behavior.

## Required Evidence

| Finish Line | Evidence Required | Status |
|---|---|---|
| Formal plan | Validated V2 `PASS` packet/review. | pending |
| Source safety | No supplied credential value in tracked source, test output, screenshots, or browser payload. | pending |
| Dual-account contract | Configuration, API, scan-service, and browser regression tests for both source keys and error conditions. | pending |
| Schema | Fresh and pre-`002` local migration tests plus live readback limited to added `ampere_*` columns/rows. | pending |
| Credential setup | Sanitized OAuth token success and Vercel secondary variable presence in only approved project/scope. | pending |
| Release | Commit/push/deployment identity and production readiness. | pending |
| User-visible result | Current desktop/mobile authenticated scanner inspection and validated visual receipt for exact deployment. | pending |

## Commands Or Tools

| Command Or Tool | Purpose | Expected Signal |
|---|---|---|
| `npm run migrate:local` | Apply only numbered additive schema locally. | Fresh and pre-`002` schemas converge with `ampere_*` objects. |
| `npm run test:server` | Validate config, source routing, scan decisions, and persistence. | Passing suite. |
| `npm run test:browser` | Exercise FIFO scan and combined snapshot behavior. | Passing browser suite. |
| Vercel approved-project read/deploy tools | Confirm exact project/deployment and configure the server-only secondary pair. | Correct project identity, ready deployment. |
| Sanitized Bol token probe | Confirm supplied pair authenticates without retaining/emitting token. | HTTP success with token body discarded. |
| Approved Turso migration/readback | Apply and verify only `ampere_*` additive changes. | Exact schema/row evidence. |
| Approved browser tooling | Inspect deployed login/scan surface at desktop and mobile. | Artifact-bound visual receipt. |

## Acceptance Criteria

Every configured account has a complete valid snapshot; ambiguous/partial data blocks scans; a GO decision uses the correct source's live shipment and order; database provenance is stored for source-qualified records and remains null for unknown codes; no secret leaves server configuration; and the released visual artifact passes its latest review cycle.

## Blocked Verification

| Check | Blocker Classification | Next Safe Route |
|---|---|---|
| Authenticated production scan | unique_access_required only if no valid existing browser session | Inspect saved session, then request only the warehouse password if needed. |

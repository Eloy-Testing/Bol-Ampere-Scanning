# Task Plan

## Literal Request

Client name is Muisstil.

## Implied Goal

Make the existing secondary account clearly identifiable to warehouse operators without altering its configured operational identity.

## Scope

Change only current visible secondary-name copy, a focused browser regression, non-secret guidance, and release evidence.

## Excluded Surfaces

Credentials, source keys, APIs, scan logic, data/schema, historical artifacts, and external-account settings are excluded.

## Affected Surfaces

`index.html`, `tests/data-health.spec.mjs`, `README.md`, task-local planning/verification evidence, and the approved production deployment.

## Phases

| ID | Provenance | Required | Work | Evidence |
|---|---|---|---|---|
| P1 | user_request | yes | Replace the static and localized secondary label with Muisstil while preserving the `secondary` source key and tab mechanics. | `index.html` diff and browser label assertion. |
| P2 | existing_contract | yes | Update non-secret operator guidance and add deterministic coverage for the static fallback plus rendered NL, EN, and ES Muisstil labels, while retaining the selected-source scan request assertion. | `README.md`, browser suite, server suite. |
| P3 | existing_contract | yes | Commit, push, deploy only the approved project, then create and validate a new Muisstil-specific deployment-bound visual-outcome receipt from its visual contract, browser-state record, and fresh desktop/mobile screenshots; preserve earlier Client Bol receipts. | Exact deployment, new Muisstil VOR, adoption manifest. |

## Done Criteria

1. Muisstil is the exact visible secondary label before and after localized rendering.
2. The static fallback and each rendered NL, EN, and ES label say Muisstil; no `Client Bol` copy remains on current product or operator-doc surfaces.
3. The secondary source remains keyed as `secondary` and scan behavior is unchanged.
4. The exact released artifact passes current test and a new Muisstil-specific deployment-bound visual/adoption evidence gate without rewriting prior receipts.

## Verification Evidence

Run migration, server, and browser suites; inspect the target diff for source-key/secret scope; capture authenticated desktop/mobile production evidence; validate deployment-bound visual and project-local adoption receipts.

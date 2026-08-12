# Transient Bol read recovery — design contract

## Audience and moment

The user is a warehouse operator at the Ampere scan station. The critical moment is initial or stale data load: the operator needs to know whether scanning is safe and what to do when it is not.

## Outcome

Ordinary transient Bol read failures recover below the browser surface within a bounded server retry budget. If a complete snapshot still cannot be established, the station remains visibly and functionally paused. The page never claims readiness while the input is disabled for unhealthy data.

## Primary focal area and action

The scanner remains the primary focal area. In ready state the dominant action is scanning a tracking code. In paused state the dominant recovery action is the existing **Retry** control in the health bar; the scanner area reinforces that scanning is paused instead of competing with the recovery action.

## Flow

1. The station loads all configured source data.
2. Retryable external failures are retried server-side within the fixed budget without product-visible diagnostics.
3. On complete success, the scanner becomes ready and receives focus.
4. On exhausted/invalid/partial data, the health bar exposes the pause and Retry action; the scanner heading, hint, WAIT flag, status, and empty decision panel all agree.
5. After a successful retry, ready copy and scanner focus return atomically with the complete snapshot.

## Visual system

Preserve the existing operational design tokens, density, health bar, navy scanner panel, WAIT/READY flag, and decision panel. Use the existing stop color role for the paused empty decision panel. Do not redesign layout, navigation, tables, metrics, or account tabs.

## Content truth

- Product copy states user impact and recovery only.
- Never show HTTP statuses, retry attempt counts, raw Bol payloads, stack traces, credentials, or Vercel internals.
- Do not say the station is ready unless `canScan()` is true.
- Do not replace a real prior GO/STOP/duplicate decision merely because a later refresh is paused.

## State contract

| State | Scanner heading and decision | Control behavior | Recovery |
|---|---|---|---|
| Loading | Existing loading health progress; no false error. | Input disabled, WAIT. | Wait for complete data. |
| Ready | Existing ready heading, scan hint, idle or last real decision. | Input enabled and focused, READY. | Scan the next parcel. |
| Refresh warning with a fresh complete snapshot | Existing ready scanner and last real decision; health bar warns that the prior complete snapshot remains active. | Input remains enabled. | Optional Refresh. |
| Paused initial/stale snapshot | Translated “Scanning paused” heading and empty paused decision with retry instruction. | Input disabled, WAIT. | Use Retry; never scan from incomplete data. |
| Paused after a real decision | Paused heading/hint and status; retain the last real decision. | Input disabled, WAIT. | Use Retry. |
| Recovered | Ready state replaces paused state only after atomic snapshot commit. | Input enabled and focused, READY. | Continue scanning. |

## Responsive and accessibility contract

The health recovery control and scanner pause explanation must remain visible and readable at 1440px desktop and 390px mobile widths without page-level overflow. `aria-live` and decision semantics remain intact; copy changes use the current language and input disabled state remains programmatically exposed. The intentional failed request may create its matching browser network-console entry; no JavaScript page error or unrelated console error is acceptable.

## Evidence

Focused server and browser tests, current desktop/mobile paused and recovered-ready screenshots, browser state/console/overflow record, exact artifact hash/deployment identity, and validated visual/adoption receipts.

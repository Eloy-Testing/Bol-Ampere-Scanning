# Client Bol account tabs — design contract

## Outcome

The authenticated station presents two isolated operational contexts whenever both approved sources are configured: **Bankhoes** is selected first and **Client Bol** is selected only through an explicit adjacent tab. A selected tab owns the visible scan queue, shipment table, order lists, totals, accepted-package progress, and cancelled-package list for that source.

## Operator flow

1. Confirm the correct account tab before scanning.
2. Scan only against that tab's shipment index.
3. Read the GO/STOP decision, then continue the existing FIFO scan loop.
4. Change tabs only between scan decisions; selection returns focus to the scanner when that source is ready.

## Placement and hierarchy

The account tab list sits immediately above the scanner and readiness line. It is a prerequisite to the primary scan decision, but it does not replace the scanner as the primary action. The selected account is evident from both tab state and the scoped worklist below it. Health/retry stays adjacent to the scanner. Progress, order tables, shipments, cancellations, and STOP review remain downstream.

## State contract

| State | Visible behavior | Recovery |
|---|---|---|
| One configured source | No account switcher is shown; the primary worklist behaves as before. | Scan when the station is ready. |
| Two configured sources | Bankhoes and Client Bol tabs are shown; Bankhoes is selected by default. | Select the intended source before scanning. |
| Selected source ready | Only that source's orders, shipments, totals, accepted records, and cancellations are rendered. | Scan the next package. |
| Account switch during an idle ready state | Selected tab becomes the only visible source context and scanner focus returns. | Scan the selected account's next package. |
| Scan verification active | Account tabs are disabled while the queued source-bound decision resolves. | Wait for GO/STOP, then continue. |
| Unknown or unverified scan | It remains a STOP. Source-unqualified history remains visible in shared STOP review so a tab cannot hide it. | Pull aside the package and resolve it manually. |
| Snapshot unhealthy or stale | The scan input remains disabled; no account worklist is treated as complete. | Use Retry/Refresh when the station reports the recovery action. |

## Content and accessibility rules

- Use fixed labels “Bankhoes” and “Client Bol”; do not expose account identifiers or credentials.
- Tabs use native buttons with `role=tab`, `aria-selected`, and an unambiguous selected visual state.
- DOM, visual, and keyboard order stay: account choice, scan input, health recovery, downstream tables, utilities.
- Keep mobile tabs on one readable row or controlled horizontal tab strip without page-level horizontal overflow.
- No debug/integration/internal account text appears in product chrome.

## Verification contract

Desktop and mobile review must show the primary default, an explicit Client Bol selection, correctly scoped source rows/counts, scan focus after switching, and no horizontal page overflow. A matching tracking code across sources remains a global fail-closed snapshot error: no tab may scan until that operational collision is resolved through a separately approved data-identity change.

# Client issues 1-3 — design contract

## Audience and moment

The operator opens a fixed warehouse station, signs in for a shift, watches package counts, and scans labels continuously across automatic data refreshes. The page must reduce repetitive setup without confusing remembered identity with authenticated access.

## Outcome

- A prior successful login may prefill the validated Station ID and Operator label on that browser. The password is never remembered by the application and remains required whenever the authenticated session is absent.
- Summary metrics use one explicit grain: shipment packages for Total, Scanned, and Awaiting scan. Open orders without labels remain a separate count.
- Accepted and cancelled package status survives reload, automatic refresh, a second station, and the 16:00 rollover while that shipment remains within the active bol operational window.
- Dynamic `acct_*` Bol accounts retain their source identity through browser normalization and rendering.

## Primary focal area and action

The scanner input and last authoritative GO/duplicate/STOP decision remain the primary focal area. Login convenience is subordinate to password authentication. Metrics remain secondary operational context and do not displace the scan loop.

## Flow

1. An unauthenticated browser asks the server for session state.
2. A valid non-authentication preference may prefill Station and Operator. Password remains blank and required.
3. A successful password login refreshes both the authenticated session and the signed preference.
4. The server loads the complete bol snapshot and the durable bounded operational package state.
5. Refresh replaces volatile bol lists atomically while merging the durable server scan decisions.
6. At 16:00 the package state does not revert while the same shipment remains in the active bol window.
7. Confirmed logout revokes the authenticated session but retains the preference; failed revocation preserves the fail-closed logout-pending retry path.

## Content and metric truth

| Metric | Grain | Definition |
|---|---|---|
| Packages with label | Shipment package | Current active-account shipments with a tracking identity in the complete bol snapshot |
| Scanned | Shipment package | Those packages with an authoritative accepted decision in durable operational state |
| Awaiting scan | Shipment package | Labelled packages that are neither accepted nor cancelled |
| No label | Open order | Current open orders before the active cutoff, kept separate from package arithmetic |
| After cutoff | Open order | Current open orders after the active cutoff |

No metric claims printed-label history or Excel parity; that requires issue 4's separate label-created ledger.

## Visual system

Preserve the existing responsive layout, navy scan panel, metric cards, tables, account tabs, language switch, and health/decision hierarchy. Only metric labels/content truth and login field values change. No new visual chrome is added for diagnostics or verification.

## State and security contract

- Preference data contains only validated Station ID and Operator label, is signed, HttpOnly, SameSite=Strict, Secure in production, and is ignored on tampering or expiry.
- Preference possession never authenticates, creates, refreshes, or revokes a session.
- The password is never included in preference data, session responses, browser storage, logs, or visible copy.
- Failed logout retains the existing auth cookie plus logout-pending block until server revocation succeeds.
- Partial bol data, database failure, expired session, unknown code, and live verification failure remain fail closed.
- A prior accepted state can become cancelled after authoritative verification, but never silently reverts to unread/open because of refresh or rollover.

## Responsive and accessibility contract

At 1440x980 and 390x900, all five metric cards remain legible without page-level overflow. Prefilled Station/Operator fields retain labels and ordinary focus order. Password remains the next required field. Existing live regions, scanner focus recovery, keyboard account switching, and Enter-terminated scan behavior remain intact.

## Evidence

Negative and positive auth tests, rollover and cross-station persistence tests, package-grain metric assertions, dynamic-account regression coverage, full server/browser suites, current desktop/mobile screenshots, console/overflow checks, exact artifact hash, and validated visual/adoption receipts.

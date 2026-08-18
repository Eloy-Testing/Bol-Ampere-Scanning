# Daily label reconciliation — browser state evidence

Artifact binding: `5f19312219a4306f290e0a33181722f467c8c598e8b931b13e5b162a072fbb4a`

Route inspected: `/index.html`

Observed states and interactions:

- Stored success: opened the authenticated report for Bankhoes/workday `2026-08-05`; observed `3` packages, `1` cancelled, `2` expected scans, `1` scanned, `1` missing, and `0` adjustments. The exception zone showed `TRACK-MISSING` first.
- Empty: opened a workday with no stored report; totals remained em dashes until the operator explicitly refreshed from Bol.
- Refresh/loading: during a delayed refresh, the prior complete totals remained visible and report controls were disabled.
- Refresh failure: after a synthetic source failure, the prior complete totals remained unchanged and the report displayed an actionable error.
- Closed/late adjustment: a stored close remained visible while later observations appeared in the adjustment total.
- Historical: changing to an older workday loaded the stored view and disabled source refresh.
- Export: downloaded CSV contained the same package-grain tracking, shipment, order, status, and timestamp rows as the report.
- Focus: opening moved focus to the exception decision zone; closing returned focus to the daily-report trigger; the scanner did not accept input while the modal was open.
- Responsive coverage: inspected the complete dialog at `1440×1000` and `390×900`; scrolled the mobile panel from the heading through the footer.
- Overflow: the initial mobile inspection exposed grid clipping from the desktop table minimum. The grid minimum-width contract was repaired; the final mobile artifact keeps controls and metrics within the dialog and reduces the action table to tracking, order, and action.
- Console and network: the final evidence capture recorded no page or console errors and the deterministic harness blocked external requests.

Automated interaction/state evidence: `tests/reconciliation.spec.mjs` and `tests/reconciliation-visual-evidence.spec.mjs`.

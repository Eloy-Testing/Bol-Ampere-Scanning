# Decision Log

Generated: 2026-08-11

## Decisions

| Decision | Rationale | Evidence |
|---|---|---|
| Keep Bankhoes as the default tab. | It is the existing primary source and preserves current operator flow. | Current configured account ordering requires `primary` first. |
| Name the tabs Bankhoes and Client Bol. | The user named the second source client Bol; labels are clear and contain no identifiers. | User request and design contract. |
| Keep complete two-source refresh atomic. | The request concerns UI separation; atomically complete snapshots are the existing fail-closed data contract. | Existing incomplete-source behavior/tests. |
| Scope accepted and cancelled records by verified source. | They have non-secret source provenance and should not make source worklists look combined. | Existing source-account persistence from the released secondary account change. |
| Preserve source-unqualified STOP review globally. | Unknown/unverified decisions do not have verified source provenance and must not disappear when a tab changes. | Existing null-source safety semantics. |
| Disable account switching during a scan decision. | The queued code, shipment, and account must stay bound through live verification. | FIFO/automatic-refocus runtime rule. |
| Retain global cross-source tracking-code collision blocking. | The current authoritative package-state identity is `(workday, tracking_code)`; making identical codes independently countable needs a separate schema/repository change. | `ScannerRepository.recordScanDecision` and existing collision test. |

## Rejected Options

| Option | Reason rejected | Revisit trigger |
|---|---|---|
| Decorative client tab over a mixed list | Does not meet operational separation. | Never under this outcome. |
| Separate client application/deployment | Broadens auth and release scope without a requirement. | Explicit request for separate station deployment. |
| Per-source partial refresh | Changes established atomic fail-closed behavior. | Explicit availability/recovery requirement. |
| Cross-source same-code support | Requires a persistence-key/schema redesign outside the requested UI boundary. | Explicit approved data-model change. |
| Persist account for unknown scans | Alters existing verified-source audit semantics. | Explicit audit-policy decision. |

## Revisit Triggers

- A request for independent per-source availability/retry behavior.
- A third approved account or a different operational label.
- Evidence that a shared unassigned STOP review is insufficient for warehouse handling.

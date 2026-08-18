# Assumption ledger

| Claim | State | Treatment |
|---|---|---|
| The manual spreadsheet represents a daily expected-versus-handed-over comparison. | Inferred from the client message and current scanner behavior. | Build the comparison and export without copying an unknown spreadsheet layout. |
| bol shipment observation is equivalent to exact label creation. | Rejected. | Use `Observed labels` and retain a future authoritative label-event source boundary. |
| StockItUp can supply an exact label-created event with the required permissions. | Unknown. | Do not access or claim it in this branch; keep source kind and provider ID extensible. |
| One tracking identity represents one physical parcel within one seller incarnation. | Verified operational fallback, with bol-supported shared shipment membership. | Deduplicate by incarnation/tracking and retain many shipment/item links. |
| A closed workday should never silently change. | Verified user outcome. | Freeze close time and label later observations as adjustments. |

# Step ledger

1. `not_recorded` — no complete server snapshot exists; show refresh recovery, not a trusted zero.
2. `refreshing` — fetch every configured account twice until two stable enumerations match; validate shipment, tracking, order, and item identity.
3. `committed` — atomically persist the run, parcels, shipment/item membership, and eligible prior-workday close records.
4. `open` — calculate the selected current workday from committed events and accepted scanner handoffs.
5. `closed` — preserve the first close timestamp; do not rewrite it.
6. `adjusted` — show package or cancellation facts first observed after close as explicit adjustments.
7. `failed` — record a sanitized failed run when possible, retain the previous complete report, and offer retry.

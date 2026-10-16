# BHP Warehouse Packing Tracker

## Project identity

This repository owns the standalone Ampere warehouse scan station: a static browser UI, Vercel Node.js Functions, direct read-only bol Retailer API access, and shared operational state in the approved Bankhoes Turso database.

## Runtime rules

- The browser may call same-origin `/api/*` routes only. Never expose bol or Turso credentials, password hashes, session secrets, or bearer tokens to browser code or web storage.
- bol remains the source of truth for orders, shipments, tracking identity, and cancellation state.
- Turso owns only scanner auth/audit and operational scan state in tables whose names begin with `ampere_`.
- Auth, database, partial-data, and live-verification failures are fail-closed and never count a package as completed.
- Preserve the FIFO, Enter-terminated, automatic-refocus scan loop.
- Operational scan state must not use localStorage. A language preference may use localStorage.
- Schema changes are additive/idempotent and must pass local migration plus repository tests before any approved live migration.

## Allowed external accounts

- Bankhoes Turso database `bankhoes-bi-data-luukhootsen.aws-eu-west-1.turso.io` in organization `luukhootsen`, approved by Zander on 2026-08-26 as this scanner's replacement connection and only to create, verify, read, and write `ampere_*` tables. Do not inspect, query, mutate, migrate, or couple to any other table; do not create/revoke tokens or change database/account settings.
- GitHub repository `Eloy-Testing/Bol-Ampere-Scanning` through the authenticated `ZanderBMC` account, approved by Zander to commit and push this standalone scanner release only. The `DevOpsNovalieri` identity was denied by GitHub and is not an authorized release path for this repository. Do not access or modify other repositories, organizations, settings, issues, or pull requests.
- Vercel account `zanderbmc`, team `Zander's projects` (`zanders-projects-7225a5a2`), approved by Zander to create/configure/deploy and verify only the `bol-ampere-scanning` project for this repository. Do not inspect or mutate unrelated Vercel projects beyond the already established Bankhoes project identity needed to confirm team ownership.
- Bankhoes bol Retailer API credentials exposed locally as `BOL_RETAILER_CLIENT_ID` and `BOL_RETAILER_CLIENT_SECRET`, approved by Zander for this scanner's read-only order/shipment verification only. Do not use the Ads API, mutate retailer resources, inspect account settings, or expose/copy the credentials outside server-only deployment environment variables.
- Additional client Bol Retailer API credentials supplied directly by Zander on 2026-08-11, approved for this scanner only as the fixed secondary read-only order/shipment source. Keep them in `BOL_SECONDARY_CLIENT_ID` and `BOL_SECONDARY_CLIENT_SECRET` server-side only; do not use any other Bol API/account surface or disclose their values.
- Bankhoes-owned StockItUp tenant at `his.stockitup.nl`, approved by Zander on 2026-08-17 for this process-automation audit only, read-only. Proceed only when the authenticated tenant identifies as Bankhoes or `BankhoesDiscounter.nl`; inspect current configuration, workflows, features, integrations, and operational state, but do not create, edit, trigger, import, export, download, message, reprice, purchase, ship, return, or otherwise mutate tenant data or settings. Do not inspect another tenant or expose credentials, customer data, or secrets.
- Google account `zander.brilleman@novalierigroup.com`, approved by Zander on 2026-08-19 for Google Stitch access for this BHP project only. May create and use a Stitch API key, verify the MCP connection, and read or write only BHP-owned Stitch projects when explicitly requested. Do not access Google Workspace data, unrelated Google services or Cloud projects, account settings beyond Stitch authentication, or unrelated Stitch projects; do not expose or persist credentials in the repository.
- Fathom account `zbrilleman@gmail.com`, authenticated as `Zander Brilleman` and approved by Zander on 2026-08-24 for read-only access to BHP-related meetings only. May identify, summarize, and transcribe relevant meetings when explicitly requested. Do not access unrelated meetings, alter Fathom data or settings, or disclose meeting content beyond the requested BHP work.
- Slack workspace `BankhoesDiscounter & SofaSchutz` (`T075CLP1JFP`), approved by Zander on 2026-08-24 to send the exact approved BHP meeting follow-up once to Petrus van Rijn (`U075J4EG8AY`). Do not read or search unrelated messages, contact other users, send unapproved wording, or perform any other workspace mutation under this exception.

No other Vercel team/project, bol retailer account, GitHub repository, Google account, or external account is approved here by default. Public bol documentation and synthetic local fixtures are allowed. Live account access requires a matching explicit approval and an updated narrow exception here.

## Verification finish line

- Run schema/migration tests, server tests, the full browser suite, and current desktop/mobile visual inspection.
- A deploy is complete only with exact deployment identity plus browser/API/database proof. Local tests or Vercel READY alone are insufficient.

# Muisstil account-label correction — design contract

## Retrieval Contract

- File: `plans/2026-08-11-rename-client-muisstil/retrieval_contract.json`
- Included: authenticated scanner account tab, localization strings, operator guidance, and tab-label regression coverage.
- Excluded: source credentials, source key, scan logic, database state, and non-scanner projects.
- Active skills: creative-design-orchestrator and visual-outcome-review.
- Page faults: none.

## Cognition Records

- Assumption ledger: contained in the retrieval contract; the user-supplied Muisstil name is authoritative.
- Altitude map: label correction only; no workflow or layout change.
- Step ledger: no new multi-step state.
- Unresolved decision: none.

## Surface

- Surface: authenticated internal warehouse scanner.
- Primary standard: preserve the existing dense workbench and safe scan flow.
- User moment: choose the correct fixed account before scanning.
- Dominant action: scan the tracking code.
- Risk if designed generically: a visual rename could accidentally change the internal account identity or appear inconsistently across languages.
- Design bias: use the exact stable Muisstil label only where the operator sees the secondary source.

## Hierarchy

- Primary focal area: the account-selection row immediately above the scanner.
- Primary action: scan after confirming Bankhoes or Muisstil.
- Secondary actions: refresh data, language selection, sign out.
- Deliberately quiet elements: internal source keys and credential configuration.
- What must not appear: Client Bol as a current operator label, account identifiers, secrets, or source-configuration narration.

## Spatial Priority

- Contract file: `plans/2026-08-11-rename-client-muisstil/spatial_priority_contract.json`
- Validation command: `node /Users/zanderbrilleman/Documents/Codex/2026-07-06/co/verification/validate-spatial-priority-contract.mjs <contract>`
- Primary decision zone: account selection followed by scan input.
- Explicit placements: Muisstil is the secondary button label in the existing account-tab row.
- Implicit placements: no new placement.
- Attention sequence: selected account, scan input, snapshot health, worklists.
- Focus sequence: selected account tab, scanner input, downstream utilities.
- Mobile invariants: the stable Muisstil label fits the existing single-row tab control without page overflow.

## Interface Output

- Contract file: `plans/2026-08-11-rename-client-muisstil/interface_output_contract.json`
- Interface output producers: applicable.
- Event origins: product workflow and user-invoked tab selection.
- Presentation owners: product owner and editor owner.
- Visible channels: account-tab name.
- Assistive channels: role and selected tab state retain the visible name.
- Telemetry-only channels: none added.
- External behavior proof: deterministic browser assertions plus live desktop/mobile inspection.

## Flow

1. First impression: two fixed account choices are readable.
2. Orientation: Bankhoes is default; Muisstil is the optional secondary source.
3. Primary decision: confirm the account.
4. Action: scan the package.
5. Confirmation: existing GO or STOP decision continues unchanged.

## Visual System

- Specialized profile: none.
- Layout pattern: existing operational workbench.
- Density: unchanged.
- Type/color/component contracts: preserve existing account-tab selected and inactive states.
- Asset strategy: no assets.

## State Contract

- Loading, empty, error, success, partial data, and permission blocked: unchanged.
- Secondary configured: the tab label reads Muisstil.
- Secondary absent: the tab remains hidden.

## Verification

- Visual checklist required: yes.
- State checklist required: yes, for configured/absent secondary tab state.
- Browser target: exact approved production deployment.
- Evidence path: `verification/screenshot-evidence/muisstil-tab-production-*.png`.
- Adoption manifest: `plans/2026-08-11-rename-client-muisstil/adoption_manifest.json`.

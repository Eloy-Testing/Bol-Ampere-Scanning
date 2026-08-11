# Decision Log

Generated: 2026-08-11

## Decisions

| Decision | Rationale | Evidence |
|---|---|---|
| Use Muisstil as the current secondary operator label. | The user supplied the client name directly. | Literal request. |
| Keep the proper name unchanged across NL, EN, and ES. | It identifies the same client in each station language. | Existing `secondaryAccount` localization structure. |
| Preserve the internal `secondary` key. | It is runtime configuration identity, not product copy. | Existing selected-source scan regression. |
| Update only current product/docs evidence, not historical records. | Historical artifacts must remain accurate to their earlier state. | Verification archive rule. |

## Rejected Options

| Option | Reason rejected | Revisit trigger |
|---|---|---|
| Rename source key or environment variables | Not required for the visible correction and risks configuration. | Explicit request to reconfigure the account. |
| Translate or embellish Muisstil | Changes the user-supplied proper name. | User supplies alternate localized brand spellings. |
| Leave old static fallback | Produces an inconsistent pre-render state. | Never for current product copy. |

## Revisit Triggers

- Zander requests a different display name or client branding.
- The secondary account changes operational identity or credentials.

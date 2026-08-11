# Secondary Bol account production visual contract

Artifact: `https://bol-ampere-scanning.vercel.app/` on deployment `dpl_B3Ka3Es6eyo9qbkoy1bEPstJ8SCU`.

The unchanged scanner interface must remain legible and operable at desktop and mobile widths. The signed-out access gate must keep credentials hidden and focused. After authenticated data loading, the scanner must show a complete combined snapshot, keep the scan input in the first decision path, preserve the ready state, and expose no credential or source-secret information. The mobile page may use its contained table scrollers, but the page itself must not horizontally overflow.

Required states are the signed-out gate, authenticated combined snapshot, manual combined-source refresh, and mobile ready state. The affected route is `/`; no audio is required.

# Decision Log

Generated: 2026-08-12

## Decisions

| Decision | Rationale | Evidence |
|---|---|---|
| Retry at `BolClient` rather than in the browser snapshot loop. | It centralizes safe external-request recovery, covers list/detail/token calls, and avoids restarting already completed snapshot pages. | `server/bol-client.mjs`, `index.html`. |
| Retry only transport failures plus `408`, `425`, `429`, and `5xx`. | These are transient classes; successful malformed data remains a correctness failure. | Existing sanitizers and fail-closed tests. |
| Use a fixed attempt cap and bounded `Retry-After`. | Prevents unbounded request amplification and keeps failure recovery deterministic. | Production intermittent failures and project retry safety requirements. |
| Keep real prior scan decisions visible during a later pause. | The existing decision is operational evidence; only the contradictory empty idle panel needs paused replacement. | Supplied screenshot and decision contract. |
| Keep retry mechanics out of product copy. | Operators need impact and recovery, not status codes or attempt details. | Interface-integrity contract. |

## Rejected Options

| Option | Reason Rejected | Revisit Trigger |
|---|---|---|
| Hide the health error or enable scanning from partial data. | Violates fail-closed runtime rules. | Never under current project contract. |
| Retry the entire browser snapshot recursively. | Repeats all completed pages/details and can amplify load. | Only if the upstream introduces snapshot-level transaction semantics. |
| Retry malformed `200` payloads. | Can mask a contract/schema failure and broaden uncertainty. | Only with authoritative Bol contract evidence that a named malformed shape is transient. |
| Add a broad observability product. | Unnecessary for the bounded repair. | Separate explicit request. |

## Revisit Triggers

- Production logs show exhausted transient retries remain frequent.
- Bol supplies documented per-status retry guidance that differs from the bounded policy.
- Authenticated production proof remains unavailable after deployment.
- A future change alters snapshot concurrency or account count.

## Independent Review Outcome

The required formal critic was dispatched before implementation but remained pending through the next coordination boundary and was interrupted under the agent-owned fallback rule. No critic verdict was produced. The builder self-check retained only idempotent read retries, fixed a three-attempt ceiling, bounded `Retry-After`, preserved immediate failure for malformed successful data, and left the browser fail-closed. This review-mechanics gap does not supply independent approval and is reported separately from the passing implementation and visual evidence.

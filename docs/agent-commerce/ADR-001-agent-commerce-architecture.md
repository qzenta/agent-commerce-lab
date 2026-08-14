# ADR-001: Agent Commerce Architecture

**Date:** 14 Aug 2026
**Status:** Proposed (not all decisions below are implemented — see status column)

## Context

Qzenta has a working x402-gated Security Snapshot POC on Cloudflare Workers (testnet only). Phase 2 research (see [AGENT-COMMERCE-MARKET-RESEARCH.md](./AGENT-COMMERCE-MARKET-RESEARCH.md)) surveyed the discovery/trust/payment ecosystem and Qzenta/Sikatrix opportunity space. This ADR records the resulting architectural decisions so they aren't left implicit in code.

## Decisions

| # | Decision | Status | Rationale |
|---|---|---|---|
| 1 | Identity: canonical entity is "Qzenta (Pty) Ltd" at `qzenta.com`; `@qzenta` Cloudflare Pay handle, x402 merchant identity, and MCP server identity all resolve under this one domain | Documented, not fully implemented | See [MACHINE-IDENTITY.md](./MACHINE-IDENTITY.md). Coherence over proliferation. |
| 2 | Do not claim `@sikatrix` as a second Cloudflare Pay handle at this time | Decided (restated from Phase 1) | One-per-account; not justified by reservation alone. Revisit only if Sikatrix ships its own machine service (market research Section F). |
| 3 | Payment protocol: x402 remains primary; do not migrate to MPP | Decided | MPP is confirmed backwards-compatible with x402 (MPP clients can already consume an unmodified x402 service) — no forcing function to migrate. Evaluate adding MPP support later as a low-marginal-cost addition on Cloudflare's SDK, not a replacement. |
| 4 | Discovery: register with x402scan and 402 Index once a public staging origin exists; defer CDP Bazaar (structurally requires a settled mainnet payment) and ERC-8004 (Draft EIP, low value with zero usage history) | Decided, not executed (requires public origin — Section 27 stop-gate) | See [AGENT-DISCOVERY-ARCHITECTURE.md](./AGENT-DISCOVERY-ARCHITECTURE.md). |
| 5 | Expose the service via both the existing HTTP endpoint and a Cloudflare MCP `paidTool` on the same Worker, sharing facilitator/price config | Decided, not built | Near-zero marginal cost given the existing stack; captures MCP-native agent clients. |
| 6 | OpenAPI spec is the canonical machine contract; `x-payment-info` per paid operation; runtime 402 must never contradict the spec | Built (draft) | See [openapi.json](./openapi.json). Matches the current implemented service only — does not describe unbuilt features. |
| 7 | First commercial experiment candidate: bundle the existing snapshot with DNS/TLS/tech-stack checks into one "Site Health Passport" call, rather than competing as an atomic lookup | Recommended, not built | Atomic domain/DNS/TLS lookups are saturated (market research Section D); aggregation is the one pattern with real evidenced transaction volume (Section B). Requires Daniel's approval before new scanning logic is built. |
| 8 | Wallets: separate wallet per environment (test/staging/production); production key in Cloudflare Workers secrets, never in `wrangler.jsonc` vars or Git | Documented, not yet applicable (no production wallet exists) | See [SECURITY-REQUIREMENTS.md](./SECURITY-REQUIREMENTS.md). |
| 9 | Security: SSRF guard, redirect-hop re-validation, DNS-rebinding protection via DoH, and request timeout are required baseline and already shipped; rate limiting and structured logging are required before any public deployment and are not yet built | Partially built | See [SECURITY-REQUIREMENTS.md](./SECURITY-REQUIREMENTS.md) for the full checklist. |
| 10 | npm audit: do not run `--force`; the two HIGH-severity advisories (axios, ws) are confirmed absent from the compiled Worker bundle via direct inspection; the 23 moderate wallet-connector advisories are bundled-but-unreachable dead code from `x402`'s own dependency chain | Decided | See [NPM-AUDIT-FINDINGS.md](./NPM-AUDIT-FINDINGS.md) for the full reachability analysis. |
| 11 | Production deployment: isolated staging/testnet only until explicit approval; no production DNS, no production wallet funding, no autonomous spending, no x402scan/ERC-8004 production registration without a presented impact/reversibility breakdown first | Decided (restates Section 27) | Load-bearing governance boundary for this entire phase — see Executive Recommendation for the specific approval requests. |

## Consequences

- The current repo (`qzenta/agent-commerce-lab`) remains a public POC with no live traffic; nothing in this ADR authorizes changing that.
- The next concrete engineering work, if approved, is: (a) build the DNS/TLS/tech-stack additions for the bundled service, (b) add the MCP `paidTool` wrapper, (c) deploy to an isolated public staging origin, (d) run discovery audits against x402scan/402 Index before requesting registration approval.
- This ADR will need a follow-up entry once Cloudflare Wallets ships (affects Decision 1's wallet-address question, flagged as open in [MACHINE-IDENTITY.md](./MACHINE-IDENTITY.md)) and once a production wallet exists (affects Decision 8).

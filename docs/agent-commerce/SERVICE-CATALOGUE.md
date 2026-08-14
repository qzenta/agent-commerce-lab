# Qzenta Machine Service Catalogue (Draft)

**Status:** Draft only. Not deployed to `qzenta.com/agents`. This is the staging content for that page once a public origin exists — publishing it live is a Section 27 stop-gate (production DNS/deployment).

This is a machine-readable catalogue with a human-readable layer, not a marketing page. The canonical machine copy is [openapi.json](./openapi.json); this document is the human-facing rendering of the same facts — kept in sync, never contradicting it.

## Website Security Snapshot

| Field | Value |
|---|---|
| Provider | Qzenta (Pty) Ltd — https://qzenta.com |
| Service | Website Security Snapshot |
| Purpose | Non-invasive, read-only security check of a given URL: HTTP status, redirect chain, HTTPS validity, common security headers, basic tech fingerprinting |
| Endpoint | `GET /snapshot/run?url=<target>` (paid), `GET /` (free discovery) |
| Protocol | HTTP + x402 |
| MCP availability | Not yet built — planned per [AGENT-DISCOVERY-ARCHITECTURE.md](./AGENT-DISCOVERY-ARCHITECTURE.md) |
| x402 availability | Yes — `paymentMiddleware` on `/snapshot/*` |
| Pricing | $0.001 test USDC per call |
| Accepted network | `base-sepolia` (testnet only — see note below) |
| Input schema | `url` query param, http(s) only, rejected if it resolves to a private/internal address |
| Output schema | See [openapi.json](./openapi.json) `#/paths/~1snapshot~1run/get/responses/200` |
| Rate limits | None implemented yet — see [SECURITY-REQUIREMENTS.md](./SECURITY-REQUIREMENTS.md) |
| SLA / reliability | None offered — proof-of-concept, no uptime commitment |
| Privacy policy | Not yet published |
| Terms | Not yet published |
| Support / contact | info@qzenta.com |
| Version | 0.1.0 |
| Status | **Proof-of-concept — not deployed, not accepting real payment** |
| Geographic / legal limitations | None known — the service scans publicly reachable URLs only, no jurisdiction restriction identified |

**Payment note:** `payTo` is currently a burn-address placeholder (`0x000000000000000000000000000000000000dEaD`). This service cannot receive real payment in its current configuration and is not live anywhere an agent could reach it.

## Known gaps (documented, not hidden)

- DNS record checks (A/AAAA/MX/TXT) — not implemented. Requires a DNS-over-HTTPS call; not yet wired in.
- TLS protocol/cipher detail — not implemented. Workers' `fetch()` doesn't expose negotiated TLS version/cipher to userland JS.
- Both gaps are flagged inline in the JSON response (`dns.note`, `tls.protocol`) rather than faked with placeholder data.

## Planned, not yet built

Per the market research recommendation ([AGENT-COMMERCE-MARKET-RESEARCH.md](./AGENT-COMMERCE-MARKET-RESEARCH.md) Section J), the next iteration under consideration is a bundled "Site Health Passport" combining this snapshot with DNS/TLS/tech-stack checks into one call — this is a recommendation for Daniel's review, not something implemented in this pass. Building it out is new scanning-logic work beyond this research phase's scope (Section 28: don't prematurely build ahead of validation).

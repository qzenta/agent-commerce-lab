# Executive Recommendation — Qzenta Agent Commerce Phase 2

**Date:** 14 Aug 2026
**For:** Daniel Onukpa
**Supporting documents:** [Market Research](./AGENT-COMMERCE-MARKET-RESEARCH.md) · [Discovery Architecture](./AGENT-DISCOVERY-ARCHITECTURE.md) · [Discoverability Strategy](./AGENT-DISCOVERABILITY-STRATEGY.md) · [ADR-001](./ADR-001-agent-commerce-architecture.md) · [Security Requirements](./SECURITY-REQUIREMENTS.md) · [Machine Identity](./MACHINE-IDENTITY.md) · [npm audit Findings](./NPM-AUDIT-FINDINGS.md) · [Service Catalogue draft](./SERVICE-CATALOGUE.md) · [Cost Model](./COST-MODEL.md) · [MCP paidTool Blocker](./MCP-PAIDTOOL-BLOCKER.md)

## Direct answers

**1. Can an external AI agent currently discover Qzenta?**
No. There is a working POC on `localhost`/testnet only. Nothing is publicly deployed, registered, or reachable by any agent today.

**2. Through which mechanisms?**
None yet, in practice. The mechanisms that *would* work once deployed: x402scan and 402 Index (both free, auto-validated by URL/schema, no settled-payment prerequisite), and a Cloudflare MCP `paidTool` listing. CDP Bazaar is structurally unreachable until a real mainnet payment settles.

**3. What must we implement to improve discovery?**
In order: (a) a public staging deployment (stop-gate, needs your approval), (b) the OpenAPI spec — drafted, in the repo now, (c) registration with x402scan/402 Index, (d) an MCP `paidTool` wrapper on the same Worker.

**4. Does Qzenta need MCP? [UPDATED 14 Aug 2026]**
Not strictly, and the "cheap addition" framing needs a correction: an attempt to build the MCP `paidTool` wrapper hit a real, currently-unresolved blocker. Cloudflare's Agents SDK (`agents@0.20.1`) requires `zod@^4.0.0` and `react@^19.0.0` as hard peer dependencies; this repo's entire `x402-hono` payment stack is locked to `zod@3.25.76`. `npm install` was refused via a real ERESOLVE conflict rather than forced with `--legacy-peer-deps`, since running two incompatible zod majors against payment-schema and tool-schema validation in the same Worker is a genuine silent-bug risk, not a formality — see [MCP-PAIDTOOL-BLOCKER.md](./MCP-PAIDTOOL-BLOCKER.md). **Recommendation stands as "yes, eventually" but is now correctly an open item, not a low-cost near-term addition** — it's blocked until either `agents` relaxes its zod peer range or `x402-hono` moves off zod v3. The HTTP endpoint remains fully functional without it; MCP reach is foregone for now, not lost permanently.

**5. Should Qzenta register with x402scan?**
Not yet — no public origin exists to register. Once one does: yes, it's free and the closest thing to a real discovery channel available today. Requires your approval per Section 27 before the actual registration action, even after staging is live.

**6. Should Qzenta register with ERC-8004?**
Not now. It's a Draft EIP — real traction (20+ networks, ~21K agents per a third-party tracker) but the interface could still change, and a fresh identity with zero usage history buys little reputation signal. Revisit once there's real transaction history to attach to an identity.

**7. Should we investigate MPP alongside x402?**
Track it, don't build it yet. Confirmed backwards-compatible (MPP clients can already consume Qzenta's existing x402 service unmodified), so no traffic is lost by waiting, and Cloudflare's SDK makes adding it later close to a non-event technically.

**8. What are the five strongest Qzenta machine services?**
From the ranked-20 research (full table in market research Section E): (1) bundled "Site Health Passport" (security + DNS + TLS + tech-stack in one call), (2) uptime/monitoring-as-a-service for third-party sites, (3) PDF text extraction to structured JSON, (4) API aggregation/gateway play, (5) the current single-purpose security snapshot as-is (viable but generic — see competitive analysis).

**9. What are the five strongest Sikatrix machine services?**
(1) PAYE/UIF/SDL payroll calculator, (2) SARS-compliant tax invoice validator, (3) provisional tax (IRP6) estimator, (4) SBC qualification + tax calculator, (5) EMP201 calculation helper. All five score high on SA-specific defensibility (market research Section F) — the axis that actually protects against a generic LLM agent just doing it itself.

**10. Which single service should become our first commercial product?**
The bundled **Site Health Passport** (Qzenta side). It extends already-working code rather than starting fresh, and targets the one demonstrated real pattern in the ecosystem — aggregation outperforms atomic lookups by every volume signal found. This is a recommendation, not a decision — see approval requests below.

**11. What should it cost? [DECIDED 14 Aug 2026 — Daniel approved, implemented]**
**$0.01/call — re-priced in code, no longer just a recommendation.** The original $0.001 POC price was found unprofitable at any volume: Coinbase's x402 facilitator began charging $0.001/settled payment (after 1,000 free/month) as of 1 Jan 2026, exactly equal to the old price, so the facilitator fee alone consumed 100% of revenue before any Workers cost. Before re-pricing, checked whether self-facilitation (skipping the facilitator) or an alternative facilitator would change the picture — self-facilitation trades a comparable gas cost for real operational burden not worth taking on pre-validation; Thirdweb's facilitator (0.3% of transaction value) would be materially cheaper than Coinbase's flat fee at this price point, but switching facilitators is a trust/reliability decision reserved for the pre-mainnet review (Section 22), not decided here — staying on the Coinbase default. Full numbers and the facilitator comparison: [COST-MODEL.md](./COST-MODEL.md). Live in `src/index.ts` and `openapi.json`/`SERVICE-CATALOGUE.md`; this is a code-only change on testnet, no deployment, doesn't cross a Section 27 gate.

**12. What would it cost us to deliver one transaction?**
**Modeled, with real published pricing** (see [COST-MODEL.md](./COST-MODEL.md)): Cloudflare Workers costs are near-negligible at this service's volume/compute profile (subrequests aren't billed at all; CPU time is a rounding error against the included pool). The dominant, non-negligible cost is the x402 facilitator's $0.001/settlement fee past the free 1,000/month — at the now-live $0.01 price, that's a fixed $0.001 cost against $0.01 revenue per transaction, a 10% cost ratio rather than the old price's 100%.

**13. Expected contribution margin at 1,000/10,000/100,000 requests? [live price is now $0.01]**
**Modeled** — at the now-implemented $0.01 price, 100,000 requests/month produces roughly **$896 contribution margin (~90%)**. (For reference, the old $0.001 price modeled to −400%/−40%/−4% at 1k/10k/100k requests — unprofitable at every volume, which is why it was replaced.) Full table in [COST-MODEL.md](./COST-MODEL.md).

**14. How will an external agent discover it?**
Per the discovery architecture: OpenAPI spec → x402scan/402 Index registration → MCP `paidTool` listing. No SEO-driven path — agentic discovery and SEO are explicitly different tracks (discoverability strategy).

**15. Why would an agent choose it instead of a competitor?**
As currently scoped, it wouldn't have a strong reason to — the plain security-snapshot is generic and overlaps with ShieldAPI and (unverified) klymax402 at the same pricing. The bundled "Site Health Passport" plus the two real differentiation gaps found in competitive research (header *misconfiguration scoring*, not just presence/absence; and an LLM-consumable pass/fail verdict rather than raw JSON) are what would give an agent an actual reason to prefer Qzenta.

**16. How will we measure whether agents actually choose it?**
Section 25's observability dashboard, once there's a deployment to observe: discovery→request→402→payment→delivery funnel tracked at each stage (Section 9/23), not just "is the code live."

**17. What is required to obtain the first $100 of real machine-generated revenue?**
In sequence: (a) your approval to deploy to isolated staging, (b) registration with free discovery channels, (c) a real (non-burn) production wallet — which is itself gated on the Cloudflare Wallets funding decision referenced in the Phase 1 handoff, (d) mainnet activation with your explicit sign-off, (e) enough real (non-self, non-testnet) transactions to reach $100 — Section 23 explicitly excludes counting our own wallet paying our own service.

**18. What should we NOT build?**
Per Section 28 and this phase's own findings: no new atomic domain/DNS/WHOIS-only tool (saturated category, confirmed by competitive research); no screenshot/scraping service (agent-scrape already ships an equivalent on Cloudflare Workers specifically — a direct infra-identical competitor); no summarization/embeddings service (every agent already has an LLM one call away — the clearest "why would an agent pay for this" failure case found); no crypto/DeFi data feed (highest real ecosystem volume, but zero fit with Qzenta's actual capabilities — a volume trap, not an opportunity); no ERC-8004 registration, no CDP Bazaar listing attempt, no mainnet activation, no production wallet funding — all pending your approval regardless of technical readiness.

## Executive summary

Phase 1 proved the payment mechanics work locally. Phase 2's job was to determine whether Qzenta could actually get found and trusted by an agent — and the honest answer is: not yet, and the ecosystem that would make that possible is younger and thinner than the original brief assumed. Discovery is genuinely fragmented (confirmed against PipRail's own docs), the atomic-lookup categories Qzenta was building toward are already crowded by several near-identical services, and even the highest-volume real service in the entire x402 ecosystem has only generated ~$3.12K lifetime. This isn't a reason to stop — it's a reason to bet on the one pattern that does show real signal (aggregation over atomic lookups) and to treat the next phase as a cheap, fast experiment rather than a funded launch.

On the Sikatrix side, the research surfaced something the original brief didn't anticipate: a live South African competitor (finserv-mcp.co.za) already validating willingness-to-pay in almost exactly the niche Sikatrix would enter. That's good news (proof of demand) and a real complication (not greenfield) — Sikatrix's edge would have to be "a licensed accounting practice stands behind this answer," not price.

## Current status [updated 14 Aug 2026 — post-hardening follow-up]

- **Implementation:** still local/testnet, still not deployed — but hardened since the initial Phase 2 pass: rate limiting (Cloudflare's native binding, verified locally), structured request logging, and a corrected $0.01/call price all shipped as code-only changes.
- **Discovery:** none — nothing is publicly reachable.
- **Trust/identity:** documented (Machine Identity doc), nothing registered.
- **Security:** SSRF/timeout/redirect-validation/DNS-rebinding protections (Phase 1) plus rate limiting and structured logging (this pass) are shipped. Production-wallet secret management remains undone and is correctly gated on a real deployment decision.
- **npm audit:** resolved as "no action needed" for both HIGH-severity advisories (confirmed absent from the compiled bundle) and the 23 moderate advisories (bundled but unreachable dead code); re-verified unchanged this pass; tracked as a standing follow-up against future `x402-hono` upgrades.
- **MCP:** attempted, blocked on a real `zod`/`react` peer-dependency conflict between `agents@0.20.1` and `x402-hono`'s zod v3 tree — not forced, documented as an open item (see Q4).
- **Pricing:** corrected from $0.001 (provably unprofitable) to $0.01/call, after verifying self-facilitation and alternative facilitators didn't change the underlying picture enough to justify a different number or a facilitator switch right now.

## Risks

- **Market risk:** this category (security/DNS/TLS-adjacent) is confirmed saturated at the atomic-lookup level; the bundled-service bet is a reasonable inference from volume data, not a proven strategy.
- **Regulatory risk (Sikatrix side):** any tool that shades from calculation into advice risks FAIS/tax-practitioner regulatory exposure — every recommended Sikatrix service must stay strictly on the calculation side of that line.
- **Standards risk:** ERC-8004 is a Draft EIP; building trust architecture that depends on its current exact schema before it's ratified is a real (if currently low-cost) lock-in risk.
- **Dependency risk:** the wallet-connector dependency chain in `x402-hono` is currently unreachable dead code, but that could change on a future upgrade without re-verification — the audit findings doc names this as a standing check, not a one-time clearance.

## Decisions requiring Daniel's approval (Section 27 — no exceptions)

None of the following have been done. Each needs the full impact/reversibility breakdown before action, not just a go-ahead in principle:

1. **Deploy to an isolated public staging origin** — required before any discovery registration can happen at all. Reversible (can be torn down), no financial exposure on testnet, but is a real public-facing change.
2. **Register with x402scan and/or 402 Index** — free, but makes Qzenta's name and (testnet) service publicly listed in a directory agents actually browse.
3. **Build the DNS/TLS/tech-stack bundle** ("Site Health Passport") — new scanning logic, testnet-only, no financial exposure, but real engineering time and a product-scope decision.
4. **Any move toward a production (non-burn) wallet, mainnet activation, or ERC-8004 registration** — explicitly out of scope for this phase and not recommended before real staging traffic exists to justify it.

## Next-phase recommendation

If approved: build the bundled service and the MCP wrapper on testnet, deploy to isolated staging, register with the two free discovery channels, and run one real discovery-audit cycle (does the live 402 match the OpenAPI spec? do the registries actually pick it up?) before asking for the next approval gate (mainnet). Do not treat "the code works" as a trigger for any of the four approval items above — that decision is yours.

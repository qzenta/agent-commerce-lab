# Agent Commerce Market Research

**Date:** 14 Aug 2026
**Status:** Research complete. No registrations, deployments, or spending have occurred as a result of this document — see Section 27 governance boundaries in the handoff.
**Method:** Four parallel research passes (ecosystem/discovery, competitors, Qzenta opportunities, Sikatrix opportunities), each grounded in live web search against primary sources as of today. Sourced claims carry citations; anything inferred is flagged as such.

---

## A. Current ecosystem

**x402** (Coinbase-originated, now stewarded by the x402 Foundation with Cloudflare) is the dominant protocol: HTTP `402 Payment Required` → agent pays in stablecoin (USDC on Base/Solana) → retries with payment proof → gets the resource. It is real and growing — x402scan reports **$52.4M settled all-time, 195M+ transactions, 844K unique buyers**, with a recent 30-day window of ~3.69M transactions / ~$1.11M volume (avg ~$0.30/call). Cloudflare cites 165M transactions / ~$600M annualized (Apr 2026). These are self-reported by trackers, not independently audited — treat as directional.

**Discovery is fragmented, not standardized** — confirmed directly from PipRail's own docs: *"No single ratified discovery standard yet."* At least four non-unified mechanisms coexist today:
- **x402scan** — free, auto-validated registration (submit a URL, it's added if a valid x402 schema is returned). No confirmed manual-audit gate despite that being asserted in some secondary sources — the live registration flow is fully automated.
- **Coinbase CDP Bazaar** (`searchX402Resources`) — free, but only indexes services *after* the Coinbase facilitator has settled a real payment against them. Structurally unusable for a testnet-only or pre-revenue service.
- **402 Index (402index.io)** — aggregator claiming 92,405 endpoints / 2,850 providers, free MCP server for agent-native browsing, indexes by schema validity (not settled-payment history), so a fresh service can appear immediately.
- **PipRail** — doesn't run its own directory; plugs into the others and proposes an OpenAPI convention (`x-payment-info`) that multiple indexes already parse, explicitly described by PipRail itself as "an emerging multi-vendor convention... not ratified."

**MCP (Model Context Protocol)** — ratified baseline is the 2025-11-25 revision; a 2026-07-28 release candidate is in flight (stateless core, MCP Apps, Tasks extension, `server/discover`). Cloudflare's Agents SDK ships `withX402`/`paidTool` specifically for x402-paid MCP tool calls — a Worker can expose the same service as both a paid HTTP endpoint and an MCP tool with shared facilitator/price config.

**ERC-8004** — confirmed still **Draft EIP status** on eips.ethereum.org. Despite that, reference Identity/Reputation/Validation registries have been live on Ethereum mainnet since 29 Jan 2026, deployed on 20+ EVM networks, with ~21,562 agents registered (third-party tracker figure, not primary-source-confirmed — directional only). Registration requires an agent URI + optional domain verification via `.well-known/agent-registration.json`; no protocol-level fee, cost is gas + hosting. Real risk: a Draft EIP's interface can still change before finalization — registering now is "a de facto standard with formal-process lag," not settled infrastructure.

**MPP (Machine Payments Protocol)** — confirmed via Cloudflare's own Agents SDK docs, shipped alongside x402 (`developers.cloudflare.com/agents/tools/payments/mpp/`). Co-authored by Tempo + Stripe, proposed to IETF (`draft-httpauth-payment-00`), spec at paymentauth.org. **Confirmed backwards-compatible with x402 in one direction**: "MPP clients can consume existing x402 services without changes to those services." Adds stablecoin (Tempo), card (Stripe/Visa/Mastercard), and Bitcoin Lightning payment methods behind one scheme. No independent adoption/volume data found — earlier-stage than x402, riding on the backward-compatibility to bootstrap.

**A2A (Agent2Agent)** — Google's agent-to-agent task protocol, with an `a2a-x402` extension letting A2A agents pay via x402 rails. Low relevance for Qzenta specifically since the Security Snapshot is a passive HTTP service, not an autonomous agent. x402scan already exposes an A2A JSON-RPC surface, giving incidental A2A visibility without Qzenta building anything A2A-native.

---

## B. Existing demand

No verified per-service transaction-volume data exists for the security/DNS/TLS-adjacent category specifically. Ecosystem-wide, the highest-volume services by real settled transactions are **API aggregators/gateways** (StableEnrich: $3.12K volume / 108K txns; BlockRun YOPO: $2.68K / 85K txns — both bundle many downstream APIs behind one endpoint) and **crypto/DeFi market data feeds** — not narrow single-purpose lookups. This is a meaningful signal: agents currently pay more for *convenience/aggregation* than for atomic data points.

For Sikatrix's category, the standout finding is a **live South African competitor**: **finserv-mcp.co.za**, built by a FAIS-licensed practitioner, already sells 33 AI-callable SA statutory calculators (income tax, PAYE, provisional tax, CGT, estate duty, VAT invoice checker, SBC tax, etc.) via MCP + API — subscription (R249–R1,999/month) plus pay-as-you-go credits (~R2/calculation). This validates willingness-to-pay in the exact niche Sikatrix would enter, but means it is not greenfield.

## C. Categories, ranked by current agent-paid activity (highest to lowest evidenced)

1. API aggregation/gateway services (highest real volume — StableEnrich, BlockRun YOPO)
2. Crypto/market data feeds (high volume, but saturated and outside Qzenta's stated capabilities)
3. Web scraping / URL-to-markdown / screenshot (high demand, but heavily cloned — including a near-identical service already running on Cloudflare Workers)
4. Domain/DNS/TLS/tech-stack intelligence (moderate demand, **heavily saturated** — multiple near-identical offerings from klymax402, Apify, OTI Labs)
5. US/global tax + finance calculators via MCP (real, documented tools exist — AgentTax, irs-taxpayer-mcp, Norman Finance)
6. SA-specific statutory/accounting calculators (thin but real — one validated competitor, no broader crowd yet)
7. Trust/reputation/compliance signal services (LION, PulseFeed — moderate activity, no single dominant player)
8. General monitoring/uptime-as-a-service for arbitrary third-party sites (gap — existing "monitoring" tools watch the x402 ecosystem's own endpoints, not customer sites)

## D. Competitive analysis (Qzenta side — security/DNS/TLS/web-research category)

15 services identified, spanning direct and adjacent competitors (full detail and source list in the standalone competitive-research pass; summarized here):

| Closest competitors | What they do | Price | Verified? |
|---|---|---|---|
| ShieldAPI MCP | 9-tool MCP: URL/domain/IP/email/prompt-injection checks, `full_scan` | $0.001–$0.02 | ✅ GitHub-verified |
| klymax402 Domain Intelligence + SSL Checker | WHOIS/DNS/SSL/Wappalyzer/header audit/subdomain discovery across 8 endpoints | From $0.001 | ⚠️ secondary-sourced, needs direct confirmation |
| OTI Labs Domain Intelligence API | Deep DNS/WHOIS/SSL/subdomain/email-sec aggregation | Subscription only, not x402-native | ✅ GitHub-verified |
| LION (Signal402) | OFAC/compliance/domain trust/firmographic bundle | $0.001–$0.95 | ✅ |
| AI Discovery Site Audit (AEO/GEO) | SEO/AI-search-optimization audit | $5.00 (notably higher than category norm) | ✅ |
| agent-scrape | Scrape/extract/screenshot MCP server, **already on Cloudflare Workers** | x402 | ✅ direct infra competitor |

No service reproduces Qzenta's exact bundle (HTTP status/redirects + HTTPS + security-header grading + tech fingerprinting) as a single named product. As currently scoped, Qzenta's snapshot is **generic** — it overlaps feature-for-feature with ShieldAPI and the (unverified) klymax402 bundle at the same micro-cent pricing norm. Real gaps found worth exploiting: header *misconfiguration scoring* (not just presence/absence — no competitor found does CSP-quality or HSTS-adequacy grading), an LLM-consumable pass/fail verdict with confidence score (most competitors return raw JSON only), and combining technical scanning with reputation scoring (no single service found does both).

## E. Qzenta opportunities — top 20 (full scoring table in the standalone research pass)

**Top 3 recommended:**
1. **"Site Health Passport"** — bundle the existing security/DNS/TLS/tech-stack checks into one call rather than competing as an atomic lookup. Rationale: the market's actual winning pattern (aggregation) plus every individual atomic check is already saturated. Buildable on the existing Hono/Workers stack with no new integrations beyond what's already scoped.
2. **Uptime/monitoring-as-a-service for arbitrary third-party sites**, agent-subscribable via webhook. Rationale: a genuine, confirmed gap (existing "monitoring" tools watch the x402 ecosystem's own endpoints, not customer sites); plays to Cloudflare-native strengths (Cron Triggers + Durable Objects). Structural challenge: doesn't map cleanly to x402's per-call model, needs a hybrid pricing design.
3. **PDF extraction to structured JSON/Markdown, pay-per-page.** Rationale: stronger demand evidence than domain-intel (docpull, Apify actor both frame this for agent pipelines explicitly), and it's genuinely hard for an agent to DIY (unlike summarization/embeddings, which the agent's own LLM already does for free). Risk: real OCR/layout work exceeds comfortable Workers-only compute — would need to scope to text-native PDFs only.

**Explicitly deprioritized:** standalone WHOIS/DNS/TLS/tech-detection (saturated), screenshot/scraping (agent-scrape already ships an equivalent on Cloudflare Workers specifically), summarization/embeddings (commodity — every agent already has an LLM one call away), crypto/DeFi price feeds (highest real volume in the whole market, but zero fit with Qzenta's actual capabilities).

## F. Sikatrix opportunities — top 20 (full scoring table in the standalone research pass)

**Top 3 recommended:**
1. **PAYE/UIF/SDL monthly payroll calculator.** Highest defensibility (three interacting, Budget-updated SARS rate tables a generic LLM will misapply or hallucinate) combined with highest repeat-usage frequency (every payroll run).
2. **SARS-compliant tax invoice validator** (full/abridged/sub-R50 tiers, Section 20 fields). SA-specific three-tier invoice regime is invisible to models trained mostly on US/EU norms. Natural x402 fit — an agent processing a supplier-invoice batch could plausibly pay per-invoice for a validity verdict.
3. **Provisional tax (IRP6) estimator with underestimation-penalty check.** Genuinely intricate two-period mechanics with real financial consequences (20% penalty) if miscalculated — high-stakes enough that paying a specialist beats guessing.

**Legal/compliance flag (explicit, load-bearing):** the safe/risky line is calculation-against-published-formula (safe) vs. interpretation/recommendation (risky — edges into FAIS/tax-practitioner regulated advice). Every recommended tool should be framed as "calculation only, not advice," with statute citations, and a human-accountant review path before anything feeds a real filing.

**Competitive reality check:** finserv-mcp.co.za already offers versions of items #1, #3, #7, #16, #17, #18, #20 on this list. Sikatrix's differentiation has to be a licensed accounting practice standing behind the answer (finserv-mcp appears to be a solo/small dev-led product), not price — this is a validated-but-contested niche, not empty space.

## G. Discovery mechanisms — ranked by likely importance (next 3-6 months)

**Worth doing now** (low/no cost, direct traffic potential): complete OpenAPI spec with `x-payment-info`; register on x402scan and/or 402 Index (both free, auto-validated, indexed by schema not settled-payment history); expose the same service as a Cloudflare MCP `paidTool` alongside the HTTP endpoint (near-zero marginal cost on the existing stack).

**Wait and see:** CDP Bazaar (structurally gated behind mainnet + real settled payments — can't list from testnet); ERC-8004 (cheap to try, but a fresh identity with zero history buys little reputation signal yet — more valuable after real usage exists); MPP (Cloudflare ships it as a sibling to x402, low marginal cost to add later, but thin independent adoption today and free backward-compat means no traffic is lost by waiting); A2A agent-card publishing (x402scan listing already grants incidental A2A visibility).

## H. Trust mechanisms — ranked by likely importance

1. **Runtime correctness** — OpenAPI metadata must exactly match live 402 behavior; x402scan and similar indexers validate this, and mismatches likely tank discoverability before any "trust" question even arises.
2. **Track record / call volume** — the CDP Bazaar ranking signal (call volume + unique payers) and ERC-8004 reputation registries both reward accumulated usage over declared identity — meaning trust is earned post-launch, not established pre-launch.
3. **Identity coherence** — one canonical name/domain/wallet across x402 merchant identity, MCP server identity, and (if pursued) ERC-8004 identity, so an agent cross-referencing sources sees one consistent entity, not fragments.
4. **ERC-8004 registration** — real but early-stage signal; worth having once there's usage to attach to it, not a prerequisite to launch.

## I. Monetization — price/volume economics

Ecosystem-wide average transaction is ~$0.30 (30-day x402scan window), but individual listings range from $0.001 (atomic lookups, heavily commoditized) to $5.00 (the one SEO-audit listing found, priced like a real product rather than a micro-test). Even the #1-ranked service by volume in the entire ecosystem generated only ~$3.12K lifetime from 108K transactions (~$0.03/call effective) — illustrating that this market is currently thin-margin at the individual-service level regardless of category. A bundled/aggregated service (Qzenta's recommended #1 opportunity) has room to price above the atomic-lookup floor precisely because it removes multi-step assembly work from the agent, which the research found is the one dimension the highest-volume real services (StableEnrich, BlockRun YOPO) actually monetize successfully.

## J. Recommendation — best first commercial experiment

**Ship the "Site Health Passport"** (Qzenta opportunity #1) as the first commercial experiment: extend the existing Security Snapshot POC's HTTP-402 endpoint with the DNS/TLS/tech-stack checks already scoped in the Phase 1 handoff, keep it on testnet, register on x402scan + 402 Index (free, immediate), and add a Cloudflare MCP `paidTool` wrapper on the same Worker. This is the lowest-new-build option (extends existing, working code rather than starting a new service), targets the one demonstrated real winning pattern in the ecosystem (aggregation beats atomic lookups), and sidesteps the worst-saturated sub-category (standalone WHOIS/DNS/TLS-only tools) by bundling rather than competing atom-for-atom. See the Executive Recommendation for the full go/no-go framing and required approval gates before any of this touches mainnet or real revenue.

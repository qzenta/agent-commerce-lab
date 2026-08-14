# Agent Discoverability Strategy

**Date:** 14 Aug 2026
**Grounded in:** [AGENT-COMMERCE-MARKET-RESEARCH.md](./AGENT-COMMERCE-MARKET-RESEARCH.md), [AGENT-DISCOVERY-ARCHITECTURE.md](./AGENT-DISCOVERY-ARCHITECTURE.md)

## SEO vs. Agentic Discovery — not synonymous

**SEO** optimizes for a search engine ranking human-readable pages against human queries, mediated by backlinks, content quality, and crawl signals accumulated over months.

**Agentic Discovery** optimizes for a machine reading structured metadata (OpenAPI, `x-payment-info`, MCP tool schemas) and validating runtime behavior (does the 402 response match the spec?) against indexes (x402scan, 402 Index, CDP Bazaar) that can pick up a new, zero-history service within hours of registration, not months.

They overlap only at the edges: a well-optimized human-readable page can be a citation source that an agent's own web search surfaces, and GitHub/technical documentation serves both a human developer evaluating Qzenta and an agent's training/retrieval corpus. But building SEO backlinks does not make a service agent-discoverable, and a perfect OpenAPI spec does nothing for human search ranking. Treat them as parallel tracks, not one strategy.

## Machine discovery

Per the discovery architecture: OpenAPI + `x-payment-info` as the substrate, x402scan + 402 Index as the free/immediate registries, Cloudflare MCP `paidTool` as the MCP-native surface, CDP Bazaar and ERC-8004 as later-stage additions gated on mainnet/usage history. See that document for the full sequencing and stop-gates.

## Human/web discovery

- **Website** (`qzenta.com/agents` per Section 6) — human-readable layer over the same machine catalogue, not a separate marketing effort. Should link out to the OpenAPI spec and registry listings directly.
- **GitHub** (`github.com/qzenta/agent-commerce-lab`, already public) — serves as technical credibility for both human evaluators and any agent/crawler that treats GitHub activity as a trust signal. Keep the README accurate and the repo active; a stale or embarrassing public repo is a negative signal, not a neutral one.
- **Case studies / authoritative articles** — not yet applicable; nothing has shipped to production. Revisit once there's a real transaction history to write about (ties to Section 23 revenue validation — don't publish a case study about testnet self-transactions).
- **Citations/backlinks** — see the dedicated note below; this is explicitly flagged in the handoff as "investigate, don't blindly build."

## Reputation

Per market research Section H: runtime correctness (spec matches live behavior) is the first-order trust signal, ahead of any registered identity. Track record (CDP Bazaar's call-volume/unique-payer ranking, ERC-8004's reputation registry) is earned post-launch. Identity coherence — one canonical name/domain/wallet across every surface — matters because an agent cross-referencing x402scan, the OpenAPI spec, and an MCP listing should see one consistent entity, not fragments that look like three different services. See [Machine Identity Coherence](./MACHINE-IDENTITY.md) for the concrete policy.

## Distribution

- **Registries** — x402scan, 402 Index (both free, immediate) are the actual distribution channels available today, not a future aspiration.
- **MCP directories** — publishing the MCP `paidTool` server makes Qzenta discoverable to MCP-native clients (Claude, Cursor, etc.) without separate registration effort, per the discovery architecture.
- **Marketplaces / agent frameworks** — CDP Bazaar (gated behind mainnet), AgenticTrade, AgenticMarket, Nevermined were surfaced in research as parallel MCP-native paid marketplaces; none evaluated in depth this phase — worth a follow-up pass once the first service is live, not before.
- **Developer communities** — no specific plan yet; deprioritized until there's a real, working, registered service to point people at.

## Backlinks — investigate, don't blindly build

Daniel proposed strengthening the Qzenta↔Sikatrix backlink architecture. The research supports a narrower framing than "build backlinks for ranking":

- **Legitimate semantic relationships that already exist and could be stated explicitly:** Qzenta provides Sikatrix's technical infrastructure (true today); Sikatrix would consume Qzenta's agent-commerce layer if/when it ships SA accounting machine services (proposed, not yet built); Qzenta's GitHub org is genuine technical proof of capability for both brands.
- **What this is not:** reciprocal links manufactured purely for search-ranking manipulation. The objective stated in the handoff — entity clarity, authority, machine understanding — is about making the *real* relationship between the two businesses legible to both search engines and agents parsing structured data (e.g., `sameAs`/`knowsAbout` schema.org properties, or an explicit "powered by Qzenta" credit on any Sikatrix machine service), not about link volume.
- **Recommendation:** defer concrete implementation until Sikatrix has an actual machine service to point to (see market research Section F) — a backlink from Sikatrix's site to "Qzenta's agent infrastructure" is much stronger once there's a real, working Sikatrix MCP tool built on that infrastructure to point at, rather than a link to a POC.

## What this strategy explicitly does not include

No SEO keyword campaign, no paid backlink acquisition, no directory-submission spam, no attempt to game any specific ranking algorithm (human or agent-facing). Every distribution channel listed above is either free-and-legitimate (x402scan, 402 Index, MCP directories) or a statement of an already-true relationship (Qzenta/Sikatrix). Nothing here requires DNS changes, billing changes, or a production deployment to plan — those remain Section 27 stop-gates.

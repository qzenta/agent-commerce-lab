# Build Checkpoint — 14 Aug 2026

Requested as a clean stopping point before potentially shifting from iterating on this one service to the broader Phase 2 strategy work (opportunity ranking, market research already exist — this checks whether it's time to act on them elsewhere instead of continuing to harden this POC).

## Live

- **Deployed:** `https://qzenta-security-snapshot.qzenta.workers.dev` (Cloudflare account: Qzenta, default workers.dev subdomain, not custom/production)
- **Endpoints:** `GET /` (free discovery), `GET /openapi.json` (spec), `GET /snapshot/run?url=<target>` (paid, $0.01/call)
- **Network:** `base-sepolia` testnet only, unchanged throughout
- **Payout wallet:** real, funded (20.0 USDC confirmed on-chain), not the burn address
- **Rate limiting:** 30 req/60s (`/`), 20 req/60s (`/snapshot/*`), IP-keyed, verified against real Cloudflare infrastructure
- **Logging:** structured JSON per request, captures rejected requests

## Proven (verified, not assumed)

- x402 payment gate works correctly — 402 challenge shape, price, network, and payout address all programmatically cross-checked against the OpenAPI spec, zero mismatches
- SSRF guard rejects private/internal ranges and resolves real hostnames via DNS-over-HTTPS (unit + integration tested; can't be proven over live HTTP since the payment gate blocks the handler pre-payment — same limitation on both local and live)
- Rate limiter behaves identically in local simulation and real Cloudflare infrastructure (empirically confirmed with a real 35-request burst)
- The two HIGH-severity npm advisories (axios, ws) are confirmed absent from the compiled Worker bundle — not a risk, verified by inspecting the actual bundle, not just the dependency tree
- $0.01/call pricing produces real contribution margin (~90% at 100k req/month) against the actual Coinbase facilitator fee — modeled with real published pricing, not estimated
- Edge propagation lag is real (a route can 404 briefly right after a successful deploy) — a finding only live deployment could surface

## Still open

1. **End-to-end paid transaction** — not attempted, explicitly deferred (not abandoned). Would require a second payer wallet/client role. A self-paid test was also explicitly ruled out as not worth doing — a real external agent transaction would prove more than a self-transaction anyway.
2. **23 moderate npm advisories** (wallet-connector chain, `@metamask/*`/`@walletconnect/*`/`wagmi`) — confirmed bundled-but-unreachable dead code, not a current risk, but tracked as a standing check against future `x402-hono` upgrades (re-verify the compiled bundle each time, don't just trust the dependency-tree count).
3. **MCP `paidTool` wrapper** — genuinely blocked, not just deprioritized. `agents@0.20.1` requires `zod@^4`/`react@^19` as hard peers; this repo's `x402-hono` tree is locked to `zod@3.25.76`. Unblocks when one side moves. Noted explicitly in the Executive Recommendation (Q4) rather than silently worked around.
4. **Registration** — report produced (`REGISTRATION-REPORT.md`), everything audits clean, but not submitted. Awaiting the actual go/no-go decision, which is framed as a business-visibility call, not a technical blocker.
5. **The service itself is still generic** — per the Phase 2 competitive research, the plain security-snapshot overlaps feature-for-feature with existing alternatives (ShieldAPI, the unverified klymax402 bundle) at the same pricing tier. The recommended differentiator (bundling into a "Site Health Passport" with DNS/TLS/tech-stack checks) has not been built — that's new scanning-logic work requiring its own approval, deliberately not built ahead of a go/no-go on the underlying product direction.

## What this checkpoint suggests

The payment-mechanics thread (Phase 1's original goal) is now genuinely closed out: the loop works, it's priced correctly, it's hardened, and a registration report exists. Nothing left in this thread is a quick win — the remaining items (end-to-end test, registration, differentiation) all require either a second-party role (a real paying agent), a business decision (registration go/no-go), or new product scope (the bundled service), not more engineering on the current POC. This is a reasonable point to pause iterating here and weigh whether the higher-leverage next move is one of those decisions, or picking up the broader Phase 2 opportunity ranking (Qzenta's other 19 candidate services, Sikatrix's 20) instead.

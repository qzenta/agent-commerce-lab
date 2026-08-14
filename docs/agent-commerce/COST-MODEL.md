# Per-Transaction Cost Model

**Date:** 14 Aug 2026
**Fills:** Executive Recommendation questions 12/13 (cost per transaction, contribution margin at 1k/10k/100k requests) — previously flagged as unmodeled.
**Method:** Real published pricing for every cost component, cited. CPU-time-per-request is the one estimated (not measured) input, flagged explicitly.

## The headline finding

**Coinbase's x402 facilitator (the default one this service uses, `x402.org/facilitator`) began charging $0.001 per settled payment as of 1 January 2026, after a free tier of 1,000 settlements/month** (source: [Coinbase Developer Platform announcement](https://x.com/CoinbaseDev/status/1995564027951665551), corroborated by [Phemex](https://phemex.com/news/article/coinbase-to-introduce-0001-fee-for-x402-facilitator-transactions-41549) and [KuCoin](https://www.kucoin.com/news/flash/coinbase-x402-facilitator-to-charge-0-001-per-settlement-starting-january-2026)). This post-dates the Phase 1 handoff's framing of the facilitator as free.

**Qzenta's current price is $0.001 per snapshot call — exactly equal to the facilitator's per-settlement fee.** Past the free tier, every dollar of facilitator cost cancels out the entire service price before any Workers/compute cost is even counted. This is the single most important number in this document and directly changes the pricing answer in the Executive Recommendation.

## Cost components, with sources

| Component | Cost | Source |
|---|---|---|
| Cloudflare Workers — Free plan | 100,000 requests/day, 10ms CPU/invocation, $0 | [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| Cloudflare Workers — Paid plan | $5/month base; 10M requests included, $0.30/additional million; 30M CPU-ms included, $0.02/additional million CPU-ms | Same source |
| Outbound subrequests (the scan's own fetch to the target URL, plus the SSRF guard's DNS-over-HTTPS lookups) | **Not billed separately** — Cloudflare does not charge for subrequests from a Worker | Same source |
| x402 facilitator settlement (Coinbase default) | Free for first 1,000 settlements/month, then **$0.001/settlement** | Coinbase Developer Platform announcement (above), effective 1 Jan 2026 |
| CPU time per request | **Estimated, not measured** — no production traffic exists to profile. Assumed ~5ms CPU per invocation (one outbound fetch, header parsing, JSON assembly — no heavy computation). This is comfortably under the 10ms free-tier-per-invocation cap and far under the 30M-CPU-ms-included Paid-plan pool at any volume modeled below. If wrong by 2-3x, it does not change the conclusion below — facilitator fees dominate the cost structure by roughly two orders of magnitude over CPU cost at this service's actual compute profile. |

## Contribution margin at 1,000 / 10,000 / 100,000 requests/month, at the CURRENT $0.001 price

Assumes Cloudflare Paid plan ($5/month fixed) for reliability — the Free plan's daily-request cap and lack of production features make it unsuitable for anything beyond local testing, even though the raw request/CPU volumes modeled here would technically fit within Free-plan limits.

| Requests/month | Revenue | Facilitator cost | Workers cost | Total cost | Contribution margin |
|---|---|---|---|---|---|
| 1,000 | $1.00 | $0 (within free tier) | $5.00 (fixed) | $5.00 | **−$4.00 (−400%)** |
| 10,000 | $10.00 | (10,000−1,000)×$0.001 = $9.00 | $5.00 | $14.00 | **−$4.00 (−40%)** |
| 100,000 | $100.00 | (100,000−1,000)×$0.001 = $99.00 | $5.00 (still within 10M included requests / 30M CPU-ms at ~5ms×100k=500k CPU-ms) | $104.00 | **−$4.00 (−4%)** |

**At every volume tested, the current $0.001 price is unprofitable.** The loss shrinks as a percentage of revenue at higher volume (the $5 fixed Workers cost amortizes), but the facilitator fee alone consumes effectively 99%+ of gross revenue past the free tier, and the fixed Workers cost adds a further fixed drag that only a much higher-volume, higher-price service would absorb comfortably.

## What price would actually produce a real margin

Solving for a price where facilitator cost is a smaller fraction of revenue, holding the same volume assumptions:

| Price/call | Facilitator cost at 100k req/month | Revenue at 100k | Workers cost | Contribution margin | Margin % |
|---|---|---|---|---|---|
| $0.001 (current) | $99.00 | $100.00 | $5.00 | **−$4.00** | −4% |
| $0.005 | $99.00 | $500.00 | $5.00 | **$396.00** | 79% |
| $0.01 | $99.00 | $1,000.00 | $5.00 | **$896.00** | 90% |

**At $0.005–$0.01/call — still within the range this document's earlier pricing note called "the same range as the existing POC and comparable market" — the facilitator fee becomes a manageable ~10–20% of revenue instead of ~100%.** The facilitator's *absolute* per-settlement cost is fixed regardless of what Qzenta charges; only the price determines what fraction of revenue it consumes.

## Pricing decision (Daniel, 14 Aug 2026): re-priced to $0.01/call

Approved — go straight to $0.01/call rather than the $0.005 minimum, since there's no reason to under-price a service that isn't live yet. At $0.01/call and 100,000 req/month, this models to **~$896 contribution margin (~90%)** against the default Coinbase facilitator's fee, per the table above. Implemented in `src/index.ts` and `docs/agent-commerce/openapi.json`/`SERVICE-CATALOGUE.md` — code-only change, no live deployment, no real transaction, does not cross a Section 27 approval gate.

## Facilitator-fee dependency — verified before re-pricing, as requested

The $0.001/settlement figure above is **specific to Coinbase's default facilitator** (`x402.org/facilitator` / CDP production facilitator), not a protocol-level constant. Two checks were run before finalizing the re-price:

**1. Self-verification/self-settlement (skipping the facilitator entirely):** Confirmed real and documented — the x402 Foundation ships a ["self-facilitation" reference example](https://github.com/x402-foundation/x402/tree/main/examples/typescript/servers/self-facilitation). Verification (checking the client's payment payload/signature) can be done off-chain with no facilitator at all, at zero marginal cost. Settlement (actually broadcasting the `transferWithAuthorization` transaction on-chain) requires: direct RPC node connectivity, a funded gas wallet, and (per x402 docs) transaction-monitoring/duplicate-settlement-detection logic Qzenta would have to build and operate itself. Gas cost on Base (an L2) for this kind of transaction is "as low as $0.001" per transaction — **comparable to, not clearly cheaper than, Coinbase's flat per-settlement fee** — while trading a fixed, predictable third-party fee for real operational burden: a hot wallet holding gas funds (itself arguably a production-wallet-adjacent decision), an RPC dependency, and new failure modes (stuck/failed settlements) that don't exist when a hosted facilitator absorbs that risk. **Not recommended at this stage** — this is exactly the kind of "elaborate infrastructure before validation" the brief's Section 28 warns against building prematurely, and self-facilitation would itself likely need its own approval-gate conversation given it requires a funded on-chain wallet.

**2. Alternative facilitators — fee structures differ materially, but none evaluated as a switch:**

| Facilitator | Fee structure | Source |
|---|---|---|
| Coinbase CDP (default, currently used) | Flat $0.001/settlement past 1,000/month free | Coinbase Developer Platform announcement (above) |
| **Thirdweb** | **0.3% of transaction value** — at $0.01/call this is $0.00003/call, ~33x cheaper than Coinbase's flat fee in absolute terms | [thirdweb pricing](https://thirdweb.com/pricing) |
| Heurist | Free, no API key required (per Phase 2 competitive research) | Cited in market research Section D sourcing |
| PayAI | Cross-chain (Avalanche/Polygon/Solana), but requires holding PayAI's native token for "maximum benefits" — adds token-price exposure Qzenta doesn't currently have | Search-sourced, not independently verified against PayAI's own docs |
| x402.rs | Open-source, self-hostable — same self-facilitation tradeoffs as above, just pre-built | [x402-rs/x402-rs](https://github.com/x402-rs/x402-rs) |

**This does change the picture in one specific sense:** a percentage-based facilitator (Thirdweb) would cost meaningfully less than Coinbase's flat fee at Qzenta's price points, and free facilitators (Heurist) exist. **It does not change the $0.01 re-pricing decision** — the re-price already produces healthy margin (~90%) against the *more expensive* default facilitator, so it doesn't depend on switching. What it does change: **facilitator choice is a real, live lever for improving margin further, not a fixed cost to design around.** Per the original brief's Section 22 caution — the public Coinbase facilitator is "fine for testnet; worth a second look before real funds move through it" — evaluating a facilitator switch (Thirdweb's percentage fee in particular) belongs in that pre-mainnet review, not decided unilaterally here. Staying on the Coinbase default for now.

## Caveats

- This model does not include Sikatrix-side services, which would have their own (likely higher, given the specialized/regulated nature of the calculations) willingness-to-pay ceiling — see market research Section F.
- CPU-time-per-request is estimated, not measured. Re-run this model with real `wrangler tail`/Logpush data once there's actual traffic — the structured logging shipped today (see `SECURITY-REQUIREMENTS.md`) captures latency but not CPU time specifically; consider adding CPU-time sampling if this becomes load-bearing for a real pricing decision.
- Facilitator fee comparisons above are current as of 14 Aug 2026 sourcing and not exhaustively verified against every provider's own docs (flagged per-row) — re-verify directly before any actual facilitator switch, don't rely on this table alone.

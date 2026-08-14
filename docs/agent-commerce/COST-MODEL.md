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

## Correction to the Executive Recommendation

`EXECUTIVE-RECOMMENDATION.md` Q11 previously said "start in the same $0.001–$0.01 range as the existing POC." That range is too wide given this finding — **the low end of that range ($0.001) is now known to be unprofitable at any volume**, not just untested. The floor price should be set with the $0.001/settlement facilitator fee as an explicit, non-negotiable input, not discovered empirically after launch. Recommend re-pricing the existing POC to at least $0.005/call before any staging deployment, and treating Section 19's pricing experiment as validating the range *above* the facilitator-fee floor, not testing whether $0.001 works (it provably doesn't, on cost grounds alone, independent of demand).

## Caveats

- This model does not include Sikatrix-side services, which would have their own (likely higher, given the specialized/regulated nature of the calculations) willingness-to-pay ceiling — see market research Section F.
- CPU-time-per-request is estimated, not measured. Re-run this model with real `wrangler tail`/Logpush data once there's actual traffic — the structured logging shipped today (see `SECURITY-REQUIREMENTS.md`) captures latency but not CPU time specifically; consider adding CPU-time sampling if this becomes load-bearing for a real pricing decision.
- Does not model alternative facilitators (e.g. Heurist's facilitator, cited in research as currently free with no API key) — switching facilitators is a real lever not evaluated here, flagged as a follow-up, not a recommendation, since facilitator choice also has trust/reliability implications the original brief flagged as worth a "second look" (Section 22).

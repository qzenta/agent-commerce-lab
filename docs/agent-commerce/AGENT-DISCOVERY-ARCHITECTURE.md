# Agent Discovery Architecture

**Date:** 14 Aug 2026
**Answers:** How does an AI agent go from not knowing Qzenta exists to successfully paying Qzenta for a service?
**Grounded in:** [AGENT-COMMERCE-MARKET-RESEARCH.md](./AGENT-COMMERCE-MARKET-RESEARCH.md), Sections A, G.

## Reality check first

Discovery is **fragmented, not standardized** — confirmed directly against PipRail's own docs ("no single ratified discovery standard yet"). There is no single registration that guarantees agent traffic. The architecture below is a set of parallel, mostly-free surfaces, not a funnel with one entry point.

## Discovery paths, as actually supported today (not aspirational)

```
                         QZENTA
                           │
            ┌──────────────┼──────────────┐
            │              │               │
       Worker HTTP    OpenAPI spec    MCP paidTool
      (402-gated,      (/openapi.json,   (same Worker,
       already built)   x-payment-info)   Cloudflare
            │              │               Agents SDK)
            └──────────────┼───────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
          x402scan     402 Index    CDP Bazaar
        (free, auto-   (free, auto-  (GATED: only
        validated URL  validated,    indexes after
        submission)    schema-based) a real settled
              │            │         mainnet payment
              │            │         via Coinbase's
              │            │         facilitator —
              │            │         not reachable
              │            │         from testnet)
              └────────────┼────────────┘
                           │
                      AI AGENT
                    (searches x402scan/
                     402 Index, or is
                     handed the OpenAPI
                     URL directly by a
                     human/another agent)
                           │
                      RUNTIME 402
                  (must exactly match
                   the OpenAPI metadata
                   — mismatches break
                   discoverability)
                           │
                        PAYMENT
                   (x402 today; MPP
                    later — MPP clients
                    can already consume
                    an unmodified x402
                    service)
                           │
                        SERVICE
                   (result + structured
                    receipt)
                           │
                  REPUTATION SIGNAL
              (CDP Bazaar ranks by call
               volume + unique payers;
               ERC-8004 reputation
               registry is a slower-
               building, optional
               parallel signal)
```

## What each path requires, concretely

| Path | Cost | Gate | Status for Qzenta |
|---|---|---|---|
| OpenAPI spec (`/openapi.json` + `x-payment-info`) | Engineering time only | None — self-published | Not yet built (Section 6/7 of this phase) |
| x402scan registration | Free | Auto-validated against live x402 schema; no confirmed manual audit step | Not registered — requires a public staging origin first (Section 27 stop-gate) |
| 402 Index | Free | Schema validity, not settled-payment history | Same — requires public origin |
| Cloudflare MCP `paidTool` | Engineering time only | Runs on the same Worker/facilitator config as the HTTP endpoint | Not yet built |
| CDP Bazaar | Free, but structurally gated | Only indexes after the **Coinbase facilitator settles a real mainnet payment** | Not reachable from `base-sepolia` testnet — revisit at mainnet launch, which is itself a Section 27 stop-gate |
| ERC-8004 identity | Gas + optional domain-verification hosting | Draft EIP; registering buys little until there's usage to attach reputation to | Deferred — see market research Section G |

## The one hard dependency

Every discovery path except the OpenAPI spec itself requires a **publicly reachable origin** (even 402 Index and x402scan need a live URL to validate against). Nothing in this architecture can be exercised further than "spec design" without a public staging deployment — which is itself gated on Daniel's approval per the governance boundaries. This document describes the architecture; it does not authorize deploying to satisfy it.

## Sequencing (matches the market research recommendation)

1. Ship the OpenAPI spec against the current (or bundled "Site Health Passport") service — no approval needed, this is local/repo work.
2. **Stop gate:** get approval to deploy to an isolated public staging origin.
3. Register with x402scan and 402 Index (free, auto-validated) — still isolated staging, no real funds.
4. Add the Cloudflare MCP `paidTool` wrapper on the same Worker.
5. Run discovery audits (x402scan-style: does the runtime 402 match the OpenAPI metadata? are all paid routes correctly gated?).
6. **Stop gate:** present findings, get explicit approval before treating the staging listing as a production listing or moving to mainnet (which is what would eventually unlock CDP Bazaar).

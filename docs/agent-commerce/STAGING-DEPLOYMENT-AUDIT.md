# Staging Deployment + Discovery Audit Report

**Date:** 14 Aug 2026
**Approved by:** Daniel (explicit, this step only — deploy to isolated staging + audit; registration is a separate, still-pending gate)
**Deployed URL:** `https://qzenta-security-snapshot.qzenta.workers.dev`
**Cloudflare account:** Qzenta (`7f12293097d24042881bbee8b2ef31d0`), authenticated via a scoped API token (Workers Scripts:Edit only, 90-day TTL) — not a full-account OAuth login, not a persistent credential handled by CC.

## Confirmed before deploy

- `X402_NETWORK`: `base-sepolia` — unchanged.
- `X402_PAY_TO`: `0x000000000000000000000000000000000000dEaD` (burn address) — unchanged.
- No custom `routes`/`workers_dev` overrides in `wrangler.jsonc` — deploy landed on the default `*.workers.dev` subdomain, not a custom or production domain, as instructed.

## Discovery audit results

| Check | Result |
|---|---|
| `GET /` (free discovery endpoint) | 200, correct JSON, ~100ms warm |
| `GET /openapi.json` | **Gap found and fixed this pass** — the spec existed only as a repo file, never served by the Worker. Added a route (`src/index.ts` imports `docs/agent-commerce/openapi.json` directly, so the served copy can't drift from the documented one), redeployed, now 200 |
| `GET /snapshot/run?url=https://example.com` | 402, correct `maxAmountRequired: "10000"` (= $0.01 in USDC atomic units), `resource` field correctly reflects the live staging URL (not localhost) |
| Rate limiter, live Cloudflare infra | Sent a 35-request burst to `GET /`: **requests 1–30 succeeded, 31–35 returned 429** — identical behavior to the local `wrangler dev` simulation, confirming the real Cloudflare rate-limiting binding enforces the same 30/60s window in production infrastructure |
| SSRF guard | **Not independently testable live** — same limitation as local testing: the x402 payment gate returns 402 before the handler (and therefore the guard) ever runs. This isn't a new gap, it's the same documented Phase 1 finding, now confirmed to also hold true against the real deployed instance, not just local dev |

## What the live deployment surfaced that local testing didn't

1. **Edge propagation lag is real and non-zero.** Immediately after the first deploy that added the `/openapi.json` route, a request to that route returned 404 — the deploy had succeeded (`wrangler deploy` reported success) but the new route hadn't yet propagated to the edge location serving the test request. A retry ~3 seconds later returned 200 correctly. `wrangler dev` has no equivalent step (it's a single local process, not a global edge rollout), so this class of "deploy succeeded but isn't visible everywhere yet" timing gap is invisible in local testing and only shows up against a real deployment. **Practical implication:** any future audit script or CI check that deploys then immediately probes the result should include a short retry/backoff, not treat an immediate 404 as a failed deploy.
2. **Rate limiter behavior is confirmed identical between local simulation and real infrastructure** — this was a real open question (Cloudflare's own docs didn't specify workers.dev compatibility when this was researched), now empirically resolved: the burst test above proves it works the same way in both environments.
3. **Warm-request latency (~85–110ms end-to-end)** is a real number now, not an estimate — useful input for the cost model's CPU-time assumption (this is wall-clock including network RTT, not CPU time specifically, but confirms nothing is unexpectedly slow).
4. Nothing else diverged — the discovery JSON, the 402 challenge shape, and the payment amount all matched local testing exactly once the missing route was added.

## Registration readiness assessment (Section 8, steps 1–7 — NOT step 8)

Per Section 8's own sequencing, this report stops here — it does **not** proceed to registering with x402scan or any discovery index. Assessment of what a public listing would show if registered:

- **Accuracy:** the discovery JSON and OpenAPI spec both correctly and honestly describe a testnet-only, non-production, burn-address-paying service. Nothing overclaims readiness.
- **Runtime/spec consistency:** confirmed matching — the live 402 response's price, network, and resource URL all agree with what `/openapi.json` documents.
- **Known limitation that would be visible to anyone auditing the listing:** `payTo` is a burn address, meaning any agent that actually tried to pay would have funds sent to an unspendable address. This is intentional at this stage (Phase 1/2 governance — no real funds) but means the service is **not actually transactable** yet, only discoverable/inspectable. Registering now would list a service that cannot complete a real transaction. This is worth Daniel weighing explicitly when deciding on the registration gate — it's not a blocker to *registering* (x402scan indexes by schema validity, not by requiring a working payout), but it means the listing wouldn't yet represent a live commercial service, only a live, honestly-labeled demo.

## Not done, per the explicit scope of this step

No x402scan registration. No 402 Index registration. No ERC-8004 action. No production wallet. No mainnet. No autonomous spending. This deployment is reachable by anyone who has or discovers the URL directly, but isn't listed anywhere that would surface it to an agent searching a discovery index.

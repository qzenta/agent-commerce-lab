# Qzenta Agent Commerce Lab — Security Snapshot POC

Proof-of-concept for x402-gated machine-to-machine commerce on Cloudflare
Workers. **Not deployed. Not production. Testnet only.**

## What this proves

An AI agent can:
1. Discover this service via `GET /` (free, describes price + endpoint)
2. Call `GET /snapshot/run?url=<target>` and receive `402 Payment Required`
3. Pay $0.01 in **test USDC on base-sepolia** (no real money) via an
   x402-compatible client (`@x402/fetch`)
4. Retry the request with payment proof and receive the JSON snapshot

## What the scanner actually checks (v1, honest scope)

- HTTP status + full redirect chain
- Whether the final URL is served over HTTPS
- Common security headers: HSTS, CSP, X-Frame-Options,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- `Server` / `X-Powered-By` headers, Cloudflare detection, basic CMS
  fingerprinting from response markup
- DNS record presence (A/AAAA/MX/TXT) via Cloudflare DNS-over-HTTPS
- TLS protocol/cipher identification via a raw-socket ClientHello probe
  (weak/legacy cipher detection)
- **Content-accuracy dimension (v2, opt-in via `content=true`):** bounded
  site crawl (up to 10 pages) with deterministic extraction of
  regulatory-figure claims (VAT thresholds, UIF ceiling, compliance
  deadlines) compared against the human-approved ground-truth store
  (D1, SELECT-only), plus cross-page contradiction detection. Ground
  truth is populated ONLY via `scripts/load-ground-truth.ts` under
  human approval — the Worker has no write path. No LLM/Ollama anywhere
  in extraction. A critical finding on a money/compliance-deadline fact
  caps the content sub-score at 35 (Gate 1 ruling D4), forcing the
  verdict to FAIL.

## What it does NOT do yet (gaps, not bugs)

- **Content dimension is data-gated, not code-gated:** the content sub-scan
  runs only when the request passes `content=true` AND the ground-truth store
  has been populated. Until `scripts/load-ground-truth.ts` has been run under
  human approval, the store is empty and content scanning reports
  "ground-truth store unavailable" (degraded, never fabricated).
- **Superseded-value (figure-stale) detection** is built and tested but no
  superseded rows are seeded yet — until a superseded effective-date boundary
  is approved by a human, old-but-known values (e.g. R1,000,000 VAT threshold)
  surface as figure-mismatch rather than figure-stale.
- **No browser-based checks** (WCAG rendering, JS execution, CWV): the content
  dimension is pure HTML/text extraction; accessibility automation is an
  explicit deferral (see GATE1-IMPLEMENTATION-PLAN.md §3.6/§13).

All existing gaps are flagged inline in the JSON response rather than faked
with placeholder data.

## Before this touches production

- [ ] Replace the testnet `X402_PAY_TO` (real funded base-sepolia wallet) with
      the real Qzenta payout address — **only once Cloudflare Wallets
      funding/Virtual Wallets are actually live** (production wallet decision
      is gated on human approval).
- [ ] Switch `X402_NETWORK` from `base-sepolia` to `base` — mainnet — only
      with your explicit sign-off, per the Phase 5 rule against paid
      production endpoints without approval.
- [ ] Populate the ground-truth store via `scripts/load-ground-truth.ts`
      under human approval (remote D1 write is a Gate 3/4 action, not local).
- [ ] Decide on rate limiting / abuse controls before any public exposure
      (this fetches arbitrary user-supplied URLs — standard SSRF hygiene
      applies: block internal/private IP ranges, add a request timeout).
- [ ] Human review of the facilitator choice — currently defaults to the
      public `x402.org/facilitator` (Coinbase-operated). Fine for testnet;
      worth a second look before real funds move through it.

## Local dev

```bash
npm install
npx wrangler dev
```

## Deploy (test/staging only — do not run against production account
## without a separate human decision)

```bash
npx wrangler deploy
```

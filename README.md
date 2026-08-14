# Qzenta Agent Commerce Lab — Security Snapshot POC

Proof-of-concept for x402-gated machine-to-machine commerce on Cloudflare
Workers. **Not deployed. Not production. Testnet only.**

## What this proves

An AI agent can:
1. Discover this service via `GET /` (free, describes price + endpoint)
2. Call `GET /snapshot/run?url=<target>` and receive `402 Payment Required`
3. Pay $0.001 in **test USDC on base-sepolia** (no real money) via an
   x402-compatible client (`@x402/fetch`)
4. Retry the request with payment proof and receive the JSON snapshot

## What the scanner actually checks (v1, honest scope)

- HTTP status + full redirect chain
- Whether the final URL is served over HTTPS
- Common security headers: HSTS, CSP, X-Frame-Options,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- `Server` / `X-Powered-By` headers, Cloudflare detection, basic CMS
  fingerprinting from response markup

## What it does NOT do yet (gaps, not bugs)

- **DNS record checks** (A/AAAA/MX/TXT) — not wired in. Workers' `fetch()`
  doesn't expose raw DNS; needs a DNS-over-HTTPS call (e.g. against
  Cloudflare's `1.1.1.1/dns-query`) added as a follow-up.
- **TLS protocol/cipher detail** — Workers' `fetch()` confirms a request
  succeeded over HTTPS but doesn't expose the negotiated TLS version or
  cipher suite to userland JS. A real TLS audit needs a raw socket check
  outside the standard Workers runtime.

Both are flagged inline in the JSON response (`dns.note`, `tls.protocol`)
rather than faked with placeholder data.

## Before this touches production

- [ ] Replace `X402_PAY_TO` in `wrangler.jsonc` with a real Qzenta payout
      address — **only once Cloudflare Wallets funding/Virtual Wallets are
      actually live**. The current value is a burn address placeholder.
- [ ] Switch `X402_NETWORK` from `base-sepolia` to `base` — mainnet — only
      with your explicit sign-off, per the Phase 5 rule against paid
      production endpoints without approval.
- [ ] Add the DNS-over-HTTPS lookups for the `dns` block.
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

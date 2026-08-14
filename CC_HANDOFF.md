# CC Handoff — Qzenta Agent Commerce Lab: Stand Up + Harden POC

## Scope of this handoff

Stand up an already-designed, already-written Cloudflare Worker POC and add
one security guard. **This is not a "build from scratch" handoff** — the
Worker code, x402 payment gating, and scan logic are already written and
type-checked. Your job is deployment plumbing plus one hardening pass.

## What already exists (do not redesign)

Attached: `qzenta-agent-commerce-lab/` containing:
- `src/index.ts` — Hono Worker entrypoint, x402-hono payment gating on
  `/snapshot/*` ($0.001 test USDC, `base-sepolia`, public
  `x402.org/facilitator`), free `GET /` discovery endpoint
- `src/snapshot.ts` — the scanner: HTTP status/redirect chain, HTTPS check,
  security headers (HSTS/CSP/X-Frame-Options/etc.), basic tech
  fingerprinting. DNS record checks and TLS cipher/version detail are
  **intentionally not implemented** (documented gaps — Workers' `fetch()`
  doesn't expose that data; see README)
- `wrangler.jsonc` — testnet config, `X402_PAY_TO` is currently a burn
  address placeholder (`0x000...dEaD`) — **do not replace this with a real
  payout address**, that's a human decision gated on Cloudflare Wallets
  funding actually shipping
- `tsconfig.json`, `package.json` — already installed/verified
  (`hono`, `x402-hono`), type-checks clean (`npx tsc --noEmit` passes),
  `wrangler deploy --dry-run` confirmed the build and bindings resolve

## Cloudflare access — important

**No Cloudflare MCP/API connector is available for this task.** Use
`wrangler login` locally on the Dell to authenticate against the real
Cloudflare account (the one that owns qzenta.com, currently logged in as
`nerkke@yahoo.com` per `/areas/cloudflare-wallets-agentic-commerce.md`).
Do not attempt to find or configure an MCP-based Cloudflare deploy path —
none exists in this environment.

## Tasks

### 1. Repo setup
- Create `github.com/qzenta/agent-commerce-lab` (public repo — no client
  financial/legal data touches this, matches the standing convention for
  Qzenta client-facing tooling)
- Copy the attached files in as the initial commit
- `npm install` locally to confirm the lockfile resolves cleanly on the
  Dell (already verified in a sandboxed container elsewhere, but re-verify
  here since real deploy happens from this machine)

### 2. SSRF guard (new work — the one thing genuinely unbuilt)
`snapshot.ts`'s `runSecuritySnapshot()` fetches whatever URL an agent
supplies via `?url=`. Before this touches anything beyond local dev, add a
guard that rejects requests targeting private/internal address space:
- Block `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`,
  `169.254.0.0/16` (link-local/cloud metadata), and `localhost`
- Resolve the hostname before fetching (or catch it via the redirect
  chain, since a redirect could point internal even if the original host
  didn't) and reject with a clear error rather than silently fetching
- Add a request timeout (5–10s) so a slow/hanging target can't tie up the
  Worker
- Write this as a small, testable function — a few unit tests covering the
  blocked ranges and a couple of legitimate public URLs are worth having

### 3. Local verification
- `wrangler dev` and confirm:
  - `GET /` returns the service description JSON
  - `GET /snapshot/run?url=https://example.com` returns a `402` with
    payment instructions (no wallet needed to see this — that's the whole
    point of testing the gate)
  - The SSRF guard actually rejects an internal-range URL
- Do **not** attempt to complete a real x402 payment flow as part of this
  verification unless you have a funded `base-sepolia` test wallet handy —
  seeing the correct `402` response is sufficient proof the gate works

### 4. Stop here
- Do **not** run `wrangler deploy` to a public URL without explicit
  approval from Daniel first (Phase 5 rule: no paid production endpoints
  without sign-off, even on testnet)
- Do **not** touch `X402_PAY_TO` or the `X402_NETWORK` value
- Report back: repo URL, confirmation the three local checks above passed,
  and the diff for the SSRF guard for review

## Reference

- `/areas/cloudflare-wallets-agentic-commerce.md` — full initiative history,
  the reserved `@qzenta` handle, and the operating rules this handoff
  follows
- Cloudflare x402 docs: https://developers.cloudflare.com/agents/tools/payments/x402/

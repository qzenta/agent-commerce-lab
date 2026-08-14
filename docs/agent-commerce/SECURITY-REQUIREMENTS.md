# Security Requirements — Before Production

**Date:** 14 Aug 2026
**Status:** Requirements documented. Nothing below has been implemented against a production wallet or production DNS — all of it is gated on Daniel's approval per Section 27.

## Wallet

- Merchant wallet must be isolated — not an address that holds any other funds or is used for any other purpose.
- No seed phrase in the repository, ever, in any form (including commit history — if one is ever accidentally committed, treat the wallet as compromised and rotate, don't just delete the commit).
- No private key in Git. Production key belongs in a secret manager (Cloudflare Workers secrets, `wrangler secret put`, not `wrangler.jsonc` vars — vars are plaintext in the repo, secrets are not).
- Restricted access — only Daniel (or whoever holds production deploy authority) can read the production secret.
- Transaction monitoring — some visibility into what the wallet actually receives/sends, so an anomaly isn't discovered after the fact. Not yet designed; revisit alongside the observability dashboard (Section 25) once there's a production wallet to monitor.

## Agent spending

- No unrestricted autonomous spending, ever, on Qzenta's side — if Qzenta itself ever becomes a *buyer* of other agents' services (not just a seller), that would need the same spending-limit/human-approval treatment as any other production wallet decision.
- Testnet (`base-sepolia`) for all development and testing, as today.
- Spending limits and human approval for any future autonomous-spending scenario — not applicable yet, since Qzenta is currently a seller only.
- Separate wallets per environment (test vs. staging vs. production) so a testnet key compromise can never touch production funds.
- Environment separation enforced in `wrangler.jsonc` / environment-specific config, not by convention alone.

## API

- **Rate limiting** — not yet implemented. Cloudflare's own rate-limiting rules (WAF/Rate Limiting Rules product) are the natural fit given the existing Cloudflare-only infra stack; scope this before any public staging deployment.
- **Abuse prevention** — tied to rate limiting; also relevant is that x402 payment itself is a natural abuse deterrent (a spam request costs the attacker money), but the free `GET /` discovery endpoint has no such protection and should have basic rate limiting regardless.
- **Request size limits** — not yet implemented; low risk for the current GET-with-query-param shape, but worth adding before any endpoint accepts a request body.
- **Timeouts** — **done.** `fetchWithTimeout` (8s) implemented in Phase 1, covers the outbound scan request.
- **SSRF protection** — **done.** Phase 1's `ssrf-guard.ts`: blocks RFC1918/loopback/link-local/cloud-metadata ranges and localhost, resolves real hostnames via DNS-over-HTTPS before fetching.
- **Redirect validation** — **done.** Every redirect hop is re-checked against the SSRF guard, not just the initial URL.
- **DNS rebinding protection** — **done.** The DoH-based hostname check resolves and validates on every request rather than trusting a cached/assumed IP, which is the standard rebinding mitigation for this shape of service.
- **Logging, observability** — not yet implemented beyond Cloudflare's default Worker logs. Ties to Section 25's dashboard — deferred until there's a public deployment worth observing.

## Infrastructure

- Use Cloudflare protections wherever appropriate — the account already has WAF/Bot Management available (used elsewhere across the Qzenta/Sikatrix stack per existing infra conventions). Apply the same standard here once a public origin exists: proxy the Worker's custom domain through Cloudflare (not `workers.dev` directly), enable Bot Fight Mode or equivalent, and keep DNS-only vs. proxied consistent with how other Qzenta properties are configured.

## Explicitly not done, and correctly so at this stage

Nothing above required a production wallet, production DNS change, or production deployment to document. The SSRF/timeout/redirect-validation items were already shipped in Phase 1 against the local testnet POC — this document's job was to confirm what's covered and name what isn't, not to implement the remainder ahead of the Section 27 approval gate for going anywhere near production.

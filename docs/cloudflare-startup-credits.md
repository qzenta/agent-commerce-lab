# Cloudflare for Startups Credit Audit

**Date:** 15 Aug 2026
**Account:** Qzenta (`7f12293097d24042881bbee8b2ef31d0`)
**Method:** Direct read-only Cloudflare API calls (`GET` only — no billing config, subscriptions, or spend touched). No extrapolation from the award email or any third-party social-media claim.

## Headline finding

**The claimed $10,000 Cloudflare for Startups credit does not appear anywhere in this account's actual billing/subscription data.** I checked every endpoint I have access to that would plausibly show it — none does. This doesn't prove the award email is wrong (credits are sometimes applied at a layer this account's API scope can't see — see "What I couldn't check" below), but nothing here corroborates the $10k figure, the 13 Aug 2026 award date, or the 12-month validity window. Treat those as unconfirmed until checked directly in the Cloudflare dashboard's Billing section.

## Entitlement matrix

| Item | Status | Evidence |
|---|---|---|
| $10,000 credit balance exists on this account | **NOT VERIFIED** | Not present in `GET /accounts/{id}/subscriptions` (14 real subscriptions returned, all standard Free-plan zones + R2 Paid + Teams Free — no credit/promo line item) or `GET /accounts/{id}` (no credit field). |
| Activation date (13 Aug 2026 per award email) | **UNKNOWN** | No corroborating record found; would need the raw award email + dashboard confirmation. |
| Expiry date (12 months per award email) | **UNKNOWN** | Same as above. |
| Workers eligibility | **UNKNOWN** | No credit balance found to check eligibility against. |
| Workers AI / AI Gateway eligibility | **NOT ELIGIBLE (this account, right now)** | `GET /accounts/{id}/ai-gateway/billing/credit-balance` returned `balance: 0`. This directly checks — and finds no support for — the unverified social-media claim that another startup on the same programme received ~$50k in Workers AI credits. Whatever that account has, this one has $0 in AI Gateway credit. |
| R2 / D1 / KV eligibility | **UNKNOWN** | R2 is on a `r2_paid` PAYGO subscription, price currently $0 (usage-based, likely just under free-tier thresholds) — no visible credit application either way. D1/KV have no billing subscription entries at all (likely still free-tier, no paid plan activated). |
| Any promotional/legacy discount on the account | **NOT PRESENT** | `legacy_discounts`-style endpoint doesn't exist for this account shape; `accounts/{id}` shows no discount/credit field. |

## What I could verify

- **Account identity**: real, confirmed — Qzenta, created 2026-05-08, account ID matches what's referenced elsewhere in this codebase (`wrangler.toml`/`DEPLOY.md` in `sikatrix-vat-api`).
- **Billing profile**: real — Daniel Amoah, Qzenta (Pty) Ltd, Alberton, ZA, billing email `nerkke@yahoo.com`.
- **Active subscriptions** (14 total, all real, all $0/mo currently):
  - R2 Paid (PAYGO, usage-based, all components at default, $0 this period)
  - Teams Free Base
  - 12× Cloudflare Free Plan, one per zone: `qzenta.com`, `qzenta.co.za`, `sikatrix.com`, `mzansihealth.co.za`, `stutterheimschool.co.za`, `lavishhaus.co.za`, `recyclingleaders.co.za`, `bkguestlodge.co.za`, `chesireattorneys.co.za`, `erga.co.za`, `hisassignment.co.za`, `ghanadiasporasa.org`, `tiqbooks.com`, `ghanadiasporasa.org`
- **AI Gateway credit balance**: $0, real payment method on file (Visa ...9426), no auto-topup configured.

## What I couldn't check

- `GET /accounts/{id}/billing/usage` and `GET /user/billing/history` both returned a real Cloudflare API auth error (code 10000) — the connected API scope doesn't cover these. A startup-program credit could plausibly be visible only in the invoice/usage history rather than the subscriptions list, so this is a genuine gap, not a dead end.
- No dashboard/browser access to Cloudflare's Billing UI, which is where startup-program credits are most likely to actually be displayed (Cloudflare doesn't appear to expose a dedicated public API endpoint for this specific promotional-credit type, based on the OpenAPI spec search performed).

## What this means for the Site Health Passport build

The Worker itself (`agent-commerce-lab`) runs on the account's Workers free tier — no paid subscription found for Workers specifically, so today's usage (DNS-over-HTTPS calls, raw TLS socket probes, the existing snapshot logic) is running under whatever the standard Workers free-tier limits are, not against any startup credit. If the $10k credit turns out to be real and Workers-eligible, current usage is negligible against it either way — no architecture or usage decision here should wait on this being resolved.

## Recommended next step

Daniel checks the Cloudflare dashboard → Billing directly (or forwards the original award email + a dashboard screenshot of the Billing/Credits section). That's the only way to close the "does this actually exist" question — nothing queryable via the API scope available here confirms or denies it definitively.

## Governance compliance

No billing configuration changed. No services provisioned. No spend created. No migration performed. All findings above came from direct `GET` calls to the account's own Cloudflare API — no data was extrapolated from the award email or the other startup's social-media claim.

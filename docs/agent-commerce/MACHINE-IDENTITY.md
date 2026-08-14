# Machine Identity Coherence

**Date:** 14 Aug 2026
**Goal:** identity coherence, not unnecessary proliferation — one entity should read as one entity across every surface an agent might cross-reference.

## How the identities relate

```
Qzenta (Pty) Ltd  — legal/business identity, CIPC registered
       │
       ▼
qzenta.com          — canonical domain (already live)
       │
       ├── @qzenta   — Cloudflare Pay handle, reserved, tied to the
       │               nerkke@yahoo.com Cloudflare account that also
       │               owns qzenta.com/sikatrix.com/tiqbooks.com/
       │               ghanadiasporasa.org zones
       │
       ├── x402 merchant identity — the payTo wallet address declared
       │    in wrangler.jsonc / the OpenAPI x-payment-info blocks.
       │    Currently a burn-address placeholder on base-sepolia.
       │    Should become the SAME address as any future Cloudflare
       │    Wallet used for @qzenta, not a second address — see
       │    "Open decision" below.
       │
       ├── MCP server identity — same Worker, same domain, described
       │    consistently with the HTTP service (same name, same price,
       │    same capability description) rather than as a separately
       │    branded product.
       │
       └── ERC-8004 identity (deferred) — if registered, should use
            an agent URI resolving under qzenta.com (e.g. a
            .well-known/agent-registration.json under the canonical
            domain), not a separate unaffiliated domain.
```

## Why @sikatrix was not claimed (restated, not re-litigated)

A Cloudflare Pay handle is one-per-account, and splitting Sikatrix onto a second Cloudflare account wasn't justified by a namespace reservation alone. This stands. Revisit only if Sikatrix's own research phase (market research Section F — SA accounting machine services) concludes Sikatrix needs to be a first-class commercial identity in its own right, not a service riding on Qzenta's technical infrastructure. That's a real possibility given finserv-mcp.co.za is a standalone brand in the same niche — but it's a decision to make once there's an actual Sikatrix machine service to attach an identity to, not preemptively.

## Documented policy

- **Canonical name:** "Qzenta" for the technology/infrastructure layer, always in full as "Qzenta (Pty) Ltd" in any formal registration (ERC-8004, x402scan provider field) — not abbreviated inconsistently across surfaces.
- **Canonical domain:** `qzenta.com` for everything Qzenta-branded. A future Sikatrix machine service (if built) would live under `sikatrix.com`, credited as "powered by Qzenta" per the discoverability strategy's backlink note, not merged into the qzenta.com domain.
- **Service naming convention:** `<verb>_<noun>` for MCP tool names (e.g. `security_snapshot`, matching the pattern already used in the Phase 2 brief's examples), consistent HTTP route naming (`/snapshot/run` today — revisit if the "Site Health Passport" bundle ships, since the name should reflect the bundled scope, not just the original single-check POC).
- **Wallet/payment address policy:** one merchant wallet per environment (test/staging/production), never reused across environments; the production wallet, once it exists, is the single `payTo` address referenced everywhere Qzenta's identity is declared (x402 config, OpenAPI spec, ERC-8004 registration if pursued) — not a different address per surface.
- **Service versioning:** semver in the OpenAPI spec (`info.version`), bumped on any breaking change to the request/response schema; MCP tool descriptions should carry the same version string so an agent comparing the two surfaces sees consistent versioning.
- **Contact identity:** `info@qzenta.com`, matching the existing entity-overview convention already established for Qzenta elsewhere.
- **Trust/reputation policy:** don't fabricate reputation signals (fake reviews, seeded transaction volume) to appear more established than the actual track record — this would be discovered and would damage the "runtime correctness = trust" foundation the discoverability strategy is built on. Let CDP Bazaar/ERC-8004 reputation accrue from real usage only.

## Open decision (not resolved here — flag for Daniel)

Whether the x402 payment wallet and any future Cloudflare Wallet tied to `@qzenta` should be the *same* address or *separate* addresses is a real open question the original brief asked to be investigated (Section 11) and this pass did not fully resolve — it depends on Cloudflare Wallets' actual product mechanics (which this phase's research did not deep-dive, since Cloudflare Wallets funding hasn't shipped yet per the Phase 1 handoff). Revisit once Cloudflare Wallets is actually available to inspect.

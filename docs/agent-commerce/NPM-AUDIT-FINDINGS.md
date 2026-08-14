# npm audit Findings — x402-hono Dependency Chain

**Date:** 14 Aug 2026
**Carried over from Phase 1:** 25 vulnerabilities (23 moderate, 2 high), all transitive through `x402-hono` → `x402` (core protocol package).
**Method:** Traced dependency chain via `npm view`/package.json inspection, then verified actual reachability by inspecting the real compiled Worker bundle (`wrangler deploy --dry-run --outdir`), not just the dependency tree — the tree alone overstates risk for a bundled/tree-shaken runtime like Cloudflare Workers.

## Root cause

`x402-hono`'s dependencies are `@coinbase/cdp-sdk`, `@solana/kit`, `hono`, `viem`, `zod`, `x402`. The `x402` core package itself depends on `wagmi` (a **browser** wallet-connection React-hooks library) even though Qzenta's Worker only ever calls the server-side `paymentMiddleware()` for facilitator verify/settle — it never initiates a wallet connection. `wagmi` pulls in `@wagmi/connectors`, which pulls in the actual vulnerable packages: `@walletconnect/*`, `@metamask/sdk*`, `@reown/appkit*`, `@gemini-wallet/core`. This is upstream package design (x402's npm package bundles both client-side wallet-connecting code and server-side facilitator code in one package with no split entry points) — not something fixable in Qzenta's own code.

## What's actually in the deployed bundle (not just the dependency tree)

Ran `npx wrangler deploy --dry-run --outdir=<tmp>` and inspected the real compiled `index.js` (4.96MB, the actual artifact that would ship to Cloudflare):

| Advisory source | Severity | In compiled bundle? | Reachable from Worker code? |
|---|---|---|---|
| `axios` (10 advisories: prototype pollution, DoS via recursion, proxy bypass, etc.) | **HIGH** | **No — zero occurrences.** Tree-shaken out entirely. | Not reachable — dead in this build. |
| `ws` (2 advisories: uninitialized memory disclosure, DoS via tiny fragments) | **HIGH** | **No — zero occurrences.** Tree-shaken out entirely. | Not reachable — Node-only WebSocket client code the Workers runtime path never touches. |
| `@metamask/*`, `@walletconnect/*`, `wagmi`, `@reown/*`, `@gemini-wallet/core` (23 moderate advisories) | MODERATE | **Partially — package identifiers appear in the bundle** (154 `MetaMask`/`metamask`, 8 `wagmi`, 11 `WalletConnect` occurrences outside the embedded paywall-page HTML string). | Bundled by esbuild as part of `x402`'s import graph, but Qzenta's Worker code (`src/index.ts`) never calls any wallet-connector function — only `paymentMiddleware()` and the facilitator's HTTP verify/settle calls. A prior spot-check on a similarly-named class (`viem`'s `WalletConnectSessionSettlementError`) turned out to be an inert EIP-1193 error-code definition, not live connection logic — some fraction of these 154+ occurrences are likely the same pattern, but this was not exhaustively proven for every one. |

**Important distinction:** the embedded `PAYWALL_TEMPLATE` (a ~427KB HTML string x402-hono ships for humans who hit a 402 page directly in a browser, with a wallet-connect UI) contains **zero** occurrences of any of these package names — the vulnerable code is not part of that HTML payload. It's bundled into the Worker's own JS, not shipped to end-user browsers via the paywall page.

## Decision, per advisory

- **axios (HIGH), ws (HIGH):** No action required right now. Confirmed absent from the compiled artifact — there is no exploitable path because the code isn't present at runtime. Re-verify after any `x402-hono`/`x402` version bump, since tree-shaking outcomes can change between versions.
- **23 moderate wallet-connector advisories:** No action required right now. Attack scenarios for WalletConnect/MetaMask/Reown SDKs assume an adversary can influence a wallet-connection session (malicious relay, session hijack, phishing-adjacent flows) — none of which apply to a Worker that never opens a wallet-connect session itself. Residual concern is bundle size / cold-start overhead from shipping unused code, not an active exploit path. **Do not run `npm audit fix --force`** — the only available fix path is `x402-hono@0.4.1`, a semver-major bump (per `fixAvailable.isSemVerMajor: true` in every affected advisory), which could change `paymentMiddleware()`'s API and would need its own compatibility pass against `src/index.ts` before adopting.
- **Standing follow-up:** track `x402-hono` releases for a version that splits client/server exports (removing the `wagmi` dependency from the server-usable entry point) — this is an upstream fix, not something to build around locally. Re-run this same reachability check (dependency trace + compiled-bundle inspection) after every `x402-hono` upgrade, not just `npm audit`'s dependency-tree view, since the tree alone overstates what's actually shipped.

## Why this method, not just `npm audit fix`

`npm audit`'s dependency-tree view can't distinguish "vulnerable code is bundled and reachable" from "vulnerable code exists in `node_modules` but esbuild tree-shook it out of what actually runs." For a Cloudflare Worker, the second case is common and the difference matters — `--force` would have forced a major-version, potentially-breaking upgrade to fix two advisories that turned out to already be non-issues (axios, ws), while leaving the moderate wallet-connector chain unresolved anyway (same major-version blocker). Checking the real compiled bundle first, as done here, is what let this be resolved as "no action needed" for the two HIGH-severity items without touching the dependency tree at all.

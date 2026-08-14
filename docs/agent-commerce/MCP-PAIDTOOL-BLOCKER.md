# MCP `paidTool` Wrapper — Blocked on a Real Dependency Conflict

**Date:** 14 Aug 2026
**Status:** Not built. Blocked, not just deferred — attempted and hit a genuine peer-dependency conflict.

## What was attempted

Per [ADR-001](./ADR-001-agent-commerce-architecture.md) decision 5, tried to add a Cloudflare Agents SDK MCP server exposing the existing security-snapshot service as a `paidTool` alongside the current HTTP endpoint, following Cloudflare's documented pattern:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { withX402, type X402Config } from "agents/x402";
```

## What happened

`npm install agents@^0.20.1 @modelcontextprotocol/sdk@^1.30.0` failed with an ERESOLVE conflict:

- `agents@0.20.1` declares `zod@^4.0.0`, `react@^19.0.0`, and `@modelcontextprotocol/sdk@1.30.0` (exact) as **hard, non-optional** peer dependencies (checked directly via `npm view agents peerDependencies peerDependenciesMeta`).
- This repo's entire `x402-hono` dependency tree — `x402-hono` → `x402` → `viem`/`@coinbase/cdp-sdk`/`wagmi` and everything under it — is locked to `zod@3.25.76` (confirmed via `npm ls zod`).
- npm correctly refused to resolve this without `--legacy-peer-deps`.

**Did not force the install.** Two different zod major versions active in the same Worker runtime is a real risk, not a formality: `x402-hono`'s own payment-schema validation and any MCP tool input-schema validation would be running against structurally different `zod` APIs (v3 vs v4 changed several schema-building and parsing internals). A silent mismatch here wouldn't surface as a type error — it would surface as a payment or tool-call validation that either wrongly accepts or wrongly rejects a request, which is a bad failure mode for anything payment-adjacent.

## Why `react` as a peer dependency at all

`agents` bundles both server-side Agent/MCP functionality and client-side React hooks in one package — the same "client and server code shipped together" pattern already seen in `x402-hono`'s own `wagmi`/WalletConnect dependency chain (see [NPM-AUDIT-FINDINGS.md](./NPM-AUDIT-FINDINGS.md)). A headless Worker that never renders anything still has to satisfy the `react` peer requirement to install the package at all.

## What would unblock this

One of:
1. A future `agents` release that either drops the hard `react`/`zod@4` peer requirement for server-only usage, or widens the `zod` peer range to include v3.
2. A future `x402-hono`/`x402` release that moves off `zod@3.x` (tracked already in [NPM-AUDIT-FINDINGS.md](./NPM-AUDIT-FINDINGS.md) as a standing follow-up for the wallet-connector chain — if that upgrade happens for other reasons, re-check whether it also resolves this).
3. Vendoring a minimal, hand-written x402-paid MCP tool handler instead of the `agents` package — technically possible (the MCP spec and x402 payment-challenge shape are both documented independently of Cloudflare's SDK), but this trades a blocked dependency for meaningfully more code to write and maintain, and wasn't attempted here given this task's hardening scope, not new-build scope.

## Recommendation

Leave this blocked and re-check on each `x402-hono` upgrade (the existing standing follow-up) — don't force-install `--legacy-peer-deps` to unblock it artificially. The HTTP endpoint remains fully functional and discoverable on its own; the MCP surface is additive, not required for the service to work.

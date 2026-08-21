# A2 — Controlled Testnet Harness: Results (VAT API target)

**Date:** 21 Aug 2026 · **Status:** A2 HARNESS RUN COMPLETE (partial — funded full lifecycle
pending). Testnet only; no real funds; VAT API only; DSH's own harness as the agent.
**Authorized scope:** real testnet calls to `sikatrix-vat-api-staging.qzenta.workers.dev`
(x402-gated, base-sepolia), the A1 state machine wired to a live world, the approved A1 design
ceilings, and ≥1 ambiguous-settlement case *if practically reproducible*.
**Deliverables:** `src/autonomous/live-world.ts` (real World), `scripts/a2-run.cjs` (+ regenerated
`a2-lib.cjs` via esbuild), `docs/A2-pass1-ledger.json`, `docs/A2-pass2-ledger.json`,
`docs/A2-transcript.txt`, this report.

---

## 1. Payer wallet (generated, UNFUNDED — action required)

- **Address: `0x2Bfd53B11F9d98D54a3902FfAfB7A2D3b6fBF9Bf`** (base-sepolia) — NEW, distinct from
  every merchant/payTo wallet (SiteHealth payTo `0x1866Fd…`; VAT API payTo `0x01886487…`).
- Private key: stored in `.payer-wallet-secret.local` (gitignored via `*.local`); never printed,
  never committed. File-derived address re-verified against the generated address.
- Balance: **0 USDC on base-sepolia, confirmed via two independent RPCs** (sepolia.base.org +
  base-sepolia.publicnode.com, direct `balanceOf` on the USDC contract). **Daniel: please fund
  with test USDC via the Circle faucet (manual click — automated submissions are flagged).**

## 2. Real endpoint state discovered (CONFIRMED, live reads)

| Route | x402-gated? | Price |
|---|---|---|
| `GET /health`, `GET /llms.txt` | free | — |
| `POST /validate` | **NOT gated** (returns validation errors, not 402) — gating inconsistency to flag | — |
| `POST /calculate` | **YES** — 402 with `maxAmountRequired 3000000` = **$3.00/transaction** | $3.00 |
| `POST /prepare` | **YES** — same $3.00 | $3.00 |

VAT API `payTo` = `0x01886487312c7564C1D7188bf1Ff9fa6dF847dd0`; asset = USDC
`0x036CbD…` on base-sepolia. **KEY FINDING: the real price ($3.00) is 12× the approved A2 design
ceiling for the VAT API ($0.25) and 3× the global per-tx ceiling ($1.00).** Per the plan, ceilings
are "A1–A2 design ceilings only, revisit with real cost data before A3" — the real cost data is
now in hand and requires a Daniel decision (§5).

## 3. Lifecycle results (the A1 machine, real world)

### PASS-1 — approved A1 design ceilings vs the real $3.00 quote
DISCOVER → IDENTIFY (vat-api) → PRICE (real **300c**) → **CHECK SPEND POLICY → rejected-per-tx
(300c > global 100c)** → **aborted-policy, 0 payments**. [PASS — the policy correctly blocks an
out-of-ceiling real quote; ledger `A2-pass1-ledger.json`]

### PASS-2 — documented harness-only ceiling override (per-tx + per-service → $4.00) to exercise
the payment client with the unfunded payer
- Attempt 1: real 402 challenge → real payment header (EIP-3009 signed by the payer, real
  facilitator submission) → retry → **real 402 `invalid_exact_evm_insufficient_balance`** →
  failed.
- Attempts 2–3: identical deterministic failure (fresh nonces `…:pay:2`, `…:pay:3`).
- Result: **escalated, 0 settled, 3 payment attempts, 3 distinct nonces, no consume, no
  duplicate payment** (each retry followed a confirmed failure). [PASS — the real payment-failure
  path; ledger `A2-pass2-ledger.json`; transcript `A2-transcript.txt`]

### Ambiguous settlement — **documented as NOT practically reproducible in this run**
The unfunded state yields a **deterministic** verification failure
(`invalid_exact_evm_insufficient_balance`), not an ambiguous/pending window — so no genuine
"settlement status unknown" case arose on the real path. The machine's ambiguous→verify
behaviour is unit-proven in A1 (§10 tests) and will be exercised for real once the payer is
funded, if the facilitator ever returns a pending/unknown state. The on-chain verify path was
exercised directly: payer USDC balance = 0 on two independent RPCs (i.e., a real
"verify → failed" read).

## 4. New defects / findings (disclosure standard = A1's)

1. **VAT API price vs approved ceiling mismatch** — $3.00 real vs $0.25 (per-service) / $1.00
   (global) approved A2 design ceilings. Not a code defect; a policy-vs-reality decision for
   Daniel before A3 (§5).
2. **`/validate` is not x402-gated** on the staging endpoint while `/calculate` and `/prepare`
   are — inconsistent gating; flag to the VAT API side (we do not modify it — production changes
   not authorized).
3. **Cosmetic ledger note** — the pass-2 acceptance note prints "per-service 25c" (the allowlist
   field) although the override ceiling (400c) was what passed; acceptance logic is correct, the
   note text is stale. Minor; fix on next pass.
4. **Funded-run prerequisites (UNKNOWN until funding + review):** the exact `/calculate` request
   body schema (a minimal body reached the 402 gate, but a settled response's body validation is
   untested) and whether the facilitator returns a pending window after funding.

## 5. Actions required from Daniel (before the funded full lifecycle / A3 discussion)

| Item | Detail |
|---|---|
| **Fund the payer wallet** | `0x2Bfd53B11F9d98D54a3902FfAfB7A2D3b6fBF9Bf` with test USDC (base-sepolia) via the Circle faucet (manual) — same pattern as the merchant wallet |
| **VAT API ceiling decision** | Raise the VAT API ceiling to ≥$3.00 (and global per-tx to ≥$3.00) for A2/A3, or review the VAT API's $3.00 price — the approved $0.25/$1.00 ceilings reject every real transaction |
| **/validate gating** | Confirm whether /validate should be paid; route to the VAT API side if it should be |
| **Body schema** | Confirm the /calculate request body schema for the funded run |

## 6. Status vs the A2 authorization

- Testnet only ✓ · VAT API only ✓ (SiteHealth untouched, PATC pilot separate) ✓ · results do
  not count toward the commercial bar ✓ (explicitly excluded) · no external agents ✓ (DSH
  harness) · no x402scan/ERC-8004/production changes/mainnet ✓.
- **A3 is NOT authorized by this report.** The funded full lifecycle (settled payment → on-chain
  verify → real consume → close) completes A2 after Daniel's funding + ceiling decision; A3 (the
  first real-money milestone) requires its own explicit go-ahead.

# A1 — Autonomous Commerce Simulation: Results

**Date:** 20 Aug 2026 · **Status:** A1 COMPLETE — simulation only. No funds, no endpoints, no
wallets, no testnet, no mainnet.
**Scope authorized:** deterministic scenario runner exercising the §7 transaction state machine
and the §10 double-payment/ambiguous-settlement protection (QZENTA-AUTONOMOUS-AGENT-COMMERCE-PLAN
v1, §16/§27).
**Deliverables:** `src/autonomous/` (types, policy, ledger, state machine), `test/autonomous-a1.test.ts`
(25 scenarios), this report.

---

## 1. Verification summary

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run --pool=threads` | **199/199 passed** (174 prior + 25 A1 scenarios) |
| Determinism | all scenarios use scripted `world` outcomes + a fixed `now` — fully reproducible, no randomness |

## 2. Pass/fail per scenario type

| Scenario type | # | Result | Notes |
|---|---|---|---|
| Service selection (security→SiteHealth, tax→VAT API; ineligible task rejected; disabled service rejected) | 4 | **PASS 4/4** | Agent never expands its own authority; ineligible/disabled → abort, zero payments |
| Price decisions vs spending policy (within-ceiling accepted; above per-service $0.25 / per-tx $1 rejected; daily $5 / monthly $50 breach rejected) | 5 | **PASS 5/5** | Rejections happen at the policy gate before any payment |
| Payment retries + failure paths (failed→retry→settled; retries exhausted → escalate with 0 settled; out-of-policy → autonomous refusal) | 3 | **PASS 3/3** | Max 2 payment retries; new nonce per attempt; never consumed on unpaid |
| **Ambiguous settlement / double-payment protection (§10)** (verify-settled → consume with exactly ONE payment; verify-failed → retry with new nonce; ledger guard refuses re-pay on settled/unverified and permits after confirmed failure; nonces never reused) | 4 | **PASS 4/4** | **Core rule holds: "payment status unknown" → verification, never re-purchase** |
| Service failure paths (failure→retry→success; **fatal → eligible alternative as a new transaction**; retries exhausted → escalate with paid-but-not-delivered recorded + refund request; fatal with no alternative → escalate) | 4 | **PASS 4/4** | Alternative selection stays within the allowlist; losses surfaced, never silent |
| Kill switch (disabled at policy gate → nothing spent; **mid-flight flip → pay-stage check freezes further issuance**) | 2 | **PASS 2/2** | Two enforcement layers verified; agent cannot disable it |
| Ledger + reconciliation (day/month spend windows; discrepancy flagged; full §11 audit trail per transaction) | 3 | **PASS 3/3** | Append-only ledger; spend counters derive from settled entries |

**Overall: 25/25 scenario checks pass.**

## 3. Design gaps A1 surfaced (and their resolution)

1. **Alternative-selection ordering (machine bug found by A1).** The first implementation
   selected candidates in *allowlist* order, so a "compliance" task (preferring the VAT API)
   could pick SiteHealth, and a fatal-service alternative recursion re-selected the *failed*
   service — an infinite/erroneous chain. **Fixed:** selection now follows the **task's
   preference order**, and the alternative recursion excludes the failed service
   (`excludeServiceId`). Verified: fatal VAT API → SiteHealth alternative as a distinct
   transaction (`tx-1-alt`) with its own payment. [CONFIRMED by A1 run; fix committed]
2. **Ledger payment counting (counting bug found by A1).** Settlement-verification records
   initially counted as "payments", which would have inflated payment counts and corrupted the
   §10 guard's view. **Fixed:** `paymentsFor()` counts only **nonce-bearing payment issues**;
   the guard's `lastPaymentFor()` includes verification records so the retry-after-verified-
   failure path works while settled/unknown never re-pay. [CONFIRMED by A1 run; fix committed]
3. **Kill-switch semantics clarified.** The kill switch is enforced at the **policy gate**
   (earliest) *and* at the **pay stage** (mid-flight). The mid-flight test clarified an
   important semantic: an **already-issued but unverified payment is not revoked** — the switch
   freezes *further issuance*; already-issued unsettled payments are handled by reconciliation/
   dispute, not by the kill switch. [PROPOSED design clarification, now tested]
4. **In-flight spend and limits (design consideration, not a defect).** Daily/monthly ceiling
   checks count **settled** spend only. An ambiguous-but-actually-settled payment does not count
   toward the ceiling until reconciliation resolves it. For A1 this is correct (conservative on
   the "don't block on uncertainty" side); at A2, decide whether in-flight/ambiguous spend should
   hold a reservation against the ceilings. [PROPOSED — A2 decision]
5. **VAT API price placeholder.** The allowlist uses $0.01 (placeholder); the real VAT API price
   is UNKNOWN until golden-case validation — the per-service ceiling ($0.25) and all price-policy
   tests are ceiling-relative, so they hold regardless of the eventual price. [UNKNOWN → A2]

## 4. Ledger evidence example (abridged, from the ambiguous-settlement scenario)

A `"security"` task with payment outcome `unknown → verify settled`: entries record SELECT
(price 1c accepted) → PAY attempt 1 (nonce `tx-1:pay:1`, status unknown, "ambiguous: unknown") →
SETTLEMENT VERIFIED (settled — **no second payment**) → SERVICE attempt 1 (success) → CLOSE
(completed). `paymentsFor("tx-1")` = exactly 1. [CONFIRMED — ledger rows asserted in the suite]

## 5. A1 pass gate

A1 is complete and green. **A2 (controlled testnet harness) is NOT authorized by this report** —
per the plan, A2 requires a separate authorization (testnet wallet activation, real agent against
the VAT API testnet surface, testnet-only funds, explicitly excluded from commercial success).

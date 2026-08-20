# Qzenta Autonomous Agent-Commerce Architecture & Governance Plan v1

**Date:** 20 Aug 2026 · **Status:** PREPARATION ONLY — no real autonomous spending authorized.
**Scope:** continuation of the existing Agent Commerce Lab (unified `@qzenta/agent-commerce` MCP,
x402 gating, SiteHealth Passport x402 integration, Sikatrix VAT API x402 integration, testnet
payment infrastructure) — not a new standalone project.
**Evidence discipline:** every recommendation is tagged CONFIRMED / STRONGLY INDICATED /
PROPOSED / UNKNOWN. All §29 decision-table rows are DSH's proposed recommendations for Daniel's
approval — nothing pre-decided, nothing executed.

**Governing principle:** the programme moves from *human approves every transaction* to *human
defines the authority; the machine exercises it* — acceptable only when the authority is
**bounded → observable → auditable → reversible → financially constrained.**

---

## 1. Executive conclusion

The architecture and governance for genuinely autonomous agent commerce are designable **today**
on the existing x402 + HTTP surface, independent of the two known blockers. The transaction rails
(x402 protocol, payment middleware, ledger, policy enforcement) do **not** require the Cloudflare
`paidTool` wrapper (Layer D) nor x402scan registration — both are convenience/discovery surfaces
that remain blocked for external reasons, and neither should hold the programme hostage
(§13–15). Recommended strategy: **two roles, two experiments** — the **VAT API** as the
transaction-rails proving ground (autonomous payment mechanics, retry, settlement, ledger,
failure handling) and **SiteHealth Passport** as the higher-value commercial demonstration *after*
the rails are proven — with the **PATC human pilot kept strictly separate** (§18–20). Nothing here
authorizes spending, wallets, mainnet, or external-agent recruitment; the first controlled
mainnet autonomous transaction must be its own explicit gate (A3).

---

## 2. Definition of autonomous commerce

- **Not:** removing human governance.
- **Is:** moving **transaction-level decisions** from human approval to **pre-authorized machine
  policy**. The human establishes the policy; the external agent operates within it.

```
HUMAN/OPERATOR ── standing authority ──► Autonomous Spending Policy
   (eligible services, max spend, currency/network, counterparties,
    retry limits, dispute rules, kill switch)
                        │
                        ▼
EXTERNAL AGENT ── Discover ── Decide ── Pay ── Consume ── Verify result
```
No human intervention inside an authorized transaction unless a policy boundary is reached.
[CONFIRMED as the stated target; PROPOSED as the design basis.]

---

## 3. Human vs agent decision boundary

| Decision | Controlled by | Notes |
|---|---|---|
| Service selection (within allowlist) | **Agent** | may choose SiteHealth / VAT API / the eligible endpoint that satisfies its task |
| Price acceptance (≤ ceiling, all conditions met) | **Agent** | without asking its operator |
| Transaction execution (pay, authorize, receive, validate, continue) | **Agent** | within policy |
| Retry (within limits) | **Agent** | proposed limits in §9 |
| Failure handling (retry / abandon / alternative / report) | **Agent** | |
| Dispute classification + refund request + evidence preservation | **Agent** | escalation beyond the dispute boundary → **Human** |
| Eligible services / spend limits / network+currency / counterparties / kill switch | **Human** | policy, never agent-extendable |
| Policy changes / mainnet activation | **Human** | |

[PROPOSED boundary; matches the handoff's §3/§4 definitions.]

---

## 4. Standing policy model (hierarchy)

```
Human policy
   ↓
Service eligibility
   ↓
Spending authority
   ↓
Transaction policy (retry/dispute limits)
   ↓
Agent decision
   ↓
x402 payment
   ↓
Service execution
```
**Invariant:** an agent decision is valid only if every higher level permits it. No agent
reasoning may override spending limits, service eligibility, network restrictions, or the kill
switch. [PROPOSED]

---

## 5. Spending authority model

**Proposed ceilings (EXAMPLES ONLY — not to be implemented without Daniel's approval):**

| Limit | Proposed value |
|---|---|
| Global per-transaction ceiling | $1.00 |
| SiteHealth Passport ceiling | $1.00 |
| VAT API ceiling | $0.25 |
| Daily autonomous ceiling | $5.00 |
| Monthly autonomous ceiling | $50.00 |

Enforcement: a **deterministic policy check before every payment** (per-tx + rolling daily/
monthly counters from the ledger). The check is read-only against a policy store the agent
cannot write. [PROPOSED values; the enforcement architecture is the design deliverable.]

---

## 6. Eligible-service model

```
ALLOW   SiteHealth Passport        (canonical URL + payTo + price range)
ALLOW   VAT API                    (canonical URL + payTo + price range)
DENY    arbitrary Qzenta endpoints
DENY    experimental services
DENY    infrastructure/admin operations
```
- The agent verifies **service identity** before paying: canonical URL, `payTo` address, and
  expected price range from the allowlist must match the live 402 challenge (anti-spoof).
- The agent **cannot expand its own authority** — eligibility is human policy. [PROPOSED]

---

## 7. Transaction state machine (deterministic)

```
DISCOVER → IDENTIFY SERVICE → CHECK ELIGIBILITY → OBTAIN PRICE → CHECK SPEND POLICY
   → ACCEPT/REJECT → PAY → VERIFY SETTLEMENT → CONSUME SERVICE → VERIFY RESULT → CLOSE
```
Every transition logs to the ledger (§11). Failure sub-machines:

```
PAYMENT FAILURE
  ├── retry allowed (≤2) → RETRY
  ├── settlement ambiguous → VERIFY SETTLEMENT (on-chain) → then decide
  └── policy exceeded → ABORT (never pay)

SERVICE FAILURE
  ├── retry allowed (≤3) → RETRY
  ├── alternative allowed → SELECT ALTERNATIVE (eligible service)
  └── otherwise → CLOSE / ESCALATE (human, if beyond dispute boundary)
```
[PROPOSED — exact retry limits proposed in §9.]

---

## 8. Payment/settlement model

- Protocol: x402 (`402 Payment Required` → EIP-3009 `transferWithAuthorization` → retry with
  proof) — already implemented and production-live on SiteHealth and VAT API surfaces.
- Settlement statuses: **settled / pending / failed / unknown**.
- Settlement authority: the facilitator receipt **plus** on-chain verification
  (`eth_getTransactionReceipt` / `balanceOf` on the merchant address) — never the client's own
  claim alone.
- The agent **consumes the service only after settlement is verified** (or after the service
  result is delivered per the x402 flow, with the receipt as evidence — the verify-before-retry
  rule in §10 is the load-bearing part).
[CONFIRMED mechanism on the existing stack; PROPOSED settlement-verification policy.]

---

## 9. Retry and dispute model

**Proposed limits (to be confirmed, not assumed):**
- Payment retries: **max 2**.
- Service retries: **max 3**.
- **No retry after an ambiguous settlement unless independently verified on-chain** (§10).
- Dispute: classify the unsuccessful transaction → request refund where the facilitator
  supports it → retry the failed service if eligible → preserve all transaction evidence.
- **Escalation:** any dispute beyond the authorized dispute boundary returns to the
  human/operator (no autonomous escalation of authority). [PROPOSED]

---

## 10. Double-payment / ambiguous-settlement protection (mandatory design area)

| Control | Design |
|---|---|
| Transaction identifier | agent-generated UUID per transaction; carried through every ledger entry |
| Idempotency | EIP-3009 **nonce** — a nonce is usable once on-chain; a retry must not reuse a nonce whose authorization may have settled |
| Settlement verification | before any retry: query the chain for the tx/receipt or verify the facilitator receipt; a "payment status unknown" state triggers **verification, never re-purchase** |
| Duplicate-payment prevention | a payment is issued only after: (a) nonce reservation recorded in the ledger, (b) no prior unsettled payment exists for the same tx id |
| Retry caps | §9 limits |
| Reconciliation | daily: ledger payments vs on-chain balance of the autonomous wallet; every discrepancy is an alert, not a silent correction |

**The core distinction the system must implement:** *"payment failed"* (settled-failed →
retry allowed) vs *"payment status unknown"* (must verify settlement before any further payment).
[PROPOSED — this is the mandatory design deliverable; reference-implemented at A1/A2.]

---

## 11. Autonomous transaction ledger

Minimum machine-readable fields per transaction (append-only):

```
agent_identity | service_identity | request | quoted_price | policy_limit |
policy_decision | payment_identifier | network | settlement_status |
service_result | retry_count | final_outcome | timestamp | error/dispute_state
```
- Storage: D1 table (same infra pattern as SiteHealth history) or the ledger registry; every
  state transition of §7 writes a row.
- This is the **autonomous-commerce audit trail**: it is what makes the programme auditable and
  what feeds the spend-limit counters and the reconciliation (§10). [PROPOSED]

---

## 12. Kill-switch architecture

- Human-only control, **agent-proof by construction**: the autonomous agent holds **no key
  material** and **no policy-write access** — it cannot disable or bypass the switch.
- Controls: (1) disable autonomous commerce (no new payments), (2) disable a specific service,
  (3) revoke credentials, (4) suspend payments, (5) **freeze the autonomous wallet** (keys are
  human-held — the ultimate lever), (6) change spending limits.
- Enforcement: the policy store is read at **every pre-pay decision**; a kill flag is checked
  before any payment is issued. [PROPOSED — mandatory per §12/§20 of the handoff.]

---

## 13. x402scan blocker analysis

| Item | Detail |
|---|---|
| Exact validator failure | External: x402scan's schema validation rejects/parses valid inputs — e.g. [ChainIdSchema rejects valid CAIP-2 namespaces (tron, aptos) — Merit-Systems/x402scan #687](https://github.com/Merit-Systems/x402scan/issues/687); independent reports of a valid `402` response failing x402scan-side parsing ([TrustBench lessons](https://github.com/lithvall/TrustBench/blob/main/lessons.md)) [CONFIRMED via external sources cited] |
| Affected registration step | The free, auto-validated registration/validation step (submit URL → validator checks the live x402 schema) [CONFIRMED from repo discovery docs] |
| External evidence | The GitHub issues above; registration was never submitted from Qzenta side (REGISTRATION-REPORT.md: "report only — nothing submitted") [CONFIRMED] |
| Qzenta's expected compliant state | Spec and runtime agree (staging audit verified the 402 challenge matches the OpenAPI spec; readiness report audits clean) — Qzenta is not knowingly non-compliant [CONFIRMED] |
| Workaround | **None safe.** Do not modify Qzenta code to compensate for an externally confirmed validator defect without evidence Qzenta is actually non-compliant. Re-test registration on a later x402scan release; 402 Index + direct OpenAPI remain alternative discovery surfaces |
| Dependency on x402scan | **Registration is a discovery-channel convenience, not a prerequisite for autonomous commerce** — agents can reach the service directly via its OpenAPI/402 surface. Do not represent registration as complete [CONFIRMED — still unregistered] |

---

## 14. Cloudflare paidTool / Zod blocker analysis

| Item | Detail |
|---|---|
| Dependency graph | `x402-hono@1.2.0 → x402@1.2.0 → zod@3.25.76` (single zod v3 in the tree — lockfile-verified); `agents@0.20.1` peer-requires `zod@^4`, `react@^19`, `@modelcontextprotocol/sdk@1.30.0` (exact) [CONFIRMED — lockfile + MCP-PAIDTOOL-BLOCKER.md] |
| Conflicting versions | zod **3.25.76** (installed, x402 tree) vs **^4.0.0** (agents peer) |
| Affected code path | MCP tool input-schema validation (zod 4) vs x402 payment-schema validation (zod 3) in the same Worker runtime |
| Origin | **Upstream**: the agents SDK's hard peers; x402-hono/x402 remain on zod 3 |
| Remediation options | (a) wait for upstream compatibility — **preferred**; (b) vendor a minimal hand-written x402-paid MCP handler (possible, more code to maintain); (c) force `--legacy-peer-deps` — **rejected** |
| Temporary adapter safe? | **No** — two zod majors in one runtime risks silent validation misbehavior in payment-adjacent paths (bad failure mode) |
| Recommendation | Leave blocked; re-check on each x402-hono upgrade (standing follow-up); do not perform an invasive dependency migration to remove it [CONFIRMED — status unchanged from MCP-PAIDTOOL-BLOCKER.md] |

---

## 15. Protocol-vs-MCP architecture (do not conflate)

| Layer | Component | Status |
|---|---|---|
| A | x402 payment protocol | **Live** (HTTP 402 → EIP-3009 → proof → result) |
| B | Qzenta payment middleware (x402-hono) | **Live** |
| C | MCP exposure | Blocked at the SDK layer (Layer D) |
| D | Cloudflare `paidTool` abstraction | **Blocked** (zod conflict, §14) |

**Where autonomous commerce can operate reliably while Layer D is blocked:** layers **A + B** via
the HTTP endpoint — the full autonomous transaction loop (discover via OpenAPI, obtain price,
accept, pay via x402, consume, verify) is implementable and testable **today**, with Layer C/D as
optional discovery convenience added later. The programme must not be made dependent on one SDK
convenience wrapper. [PROPOSED — supported by the live HTTP/x402 stack]

---

## 16. A0–A6 validation framework

| Stage | Content | Funds |
|---|---|---|
| **A0** | Policy model + transaction state machine (this plan) | — |
| **A1** | Simulation: service selection, price decisions, spending policies, retries, failure paths (incl. ambiguous-settlement simulation) | none |
| **A2** | Controlled testnet: a real machine agent, testnet funds only. **Explicitly excluded from commercial success** | testnet |
| **A3** | **Controlled mainnet** (first true autonomous transaction): very low ceiling, ONE approved service, real agent + real funds + real settlement; human watches externally but does **not** approve the individual transaction | mainnet, gated |
| **A4** | Repeated autonomous transactions: successes, failures, retries, ambiguous outcomes, service responses | mainnet |
| **A5** | Independent external agents (multiple machine customers) — only after A4 passes | mainnet |
| **A6** | Scale validation: commercial thresholds + autonomous safety thresholds (§17) | mainnet |

Each stage has an explicit pass gate; testnet never counts toward commercial success.
[PROPOSED — matches the handoff's §13 staging.]

---

## 17. Revised autonomous success criteria

**Commercial (unchanged from the ACL proposal, retained):** 10 independent paying machine
customers · 100 successful paid requests · ≥$100 real revenue.

**Autonomous safety (additional — the revised bar):**

| Criterion | Proposed threshold |
|---|---|
| Unauthorized transactions | **0** |
| Policy-limit violations | **0** |
| Unreconciled payments | **0** |
| Preventable duplicate payments | **0** |
| Transaction ledger coverage | **100%** of state transitions |
| Kill-switch tests | **100%** success (disable/pause/freeze/revoke) |
| Defined failure scenarios handled | all defined (payment retry, service retry, abort, alternative) |
| Ambiguous-payment scenario handled | ≥1 (verify-then-decide, no blind re-pay) |
| Service-failure/retry scenario handled | ≥1 |
| Autonomous rejection of an out-of-policy transaction | ≥1 (agent refuses to pay above ceiling / ineligible service) |

[PROPOSED thresholds — recommend approving these alongside the A3 gate.]

---

## 18. VAT API assessment

- **Current position (CONFIRMED):** x402 work exists; Agent Commerce Lab integration exists;
  **golden-case validation is not yet complete**; production VAT API not to be altered.
- Advantages: simpler machine-to-machine transaction; potentially easier to automate; likely
  lower per-transaction cost; easier to repeat at scale.
- Disadvantage: the service itself is not yet sufficiently validated.
- **Proposed role: protocol/transaction proving ground** — the first place to exercise
  autonomous payment mechanics, price acceptance, retry, settlement, ledger, and failure
  handling (A2/A3), because a mistake there is cheap and isolated. [PROPOSED]

## 19. SiteHealth Passport assessment

- **Current position (CONFIRMED per handoff + prior gates):** production; content-accuracy
  dimension live; Gate 4 closed; commercial validation underway; **R499/site/month hypothesis
  approved; first external human prospect (PATC) is part of the commercial-validation
  programme**.
- Advantages for autonomous commerce: production service; established pricing concept; clear
  service boundary; already exposed through x402; richer transaction value; strong discovery
  demonstration.
- Disadvantages: concurrent human commercial validation — **autonomous purchasing in the same
  customer relationship would contaminate the PATC pilot**; relatively complex output.
- **Proposed role: higher-value commercial demonstration** — used for autonomous discovery,
  service selection, and a real agent customer journey **after** the transaction rails are
  proven on the VAT API. **The PATC human pilot and the autonomous agent-commerce pilot are two
  distinct experiments and must remain separate.** [PROPOSED]

## 20. Recommended first autonomous-service strategy

**Two roles, not one winner:**
1. **VAT API first** — the transaction-rails proving ground (payment mechanics, price
   acceptance, retry, settlement, ledger, failure handling).
2. **SiteHealth second** — the higher-value commercial demonstration (discovery, service
   selection, real agent journey), after rails are proven.

Do not force one product to perform both jobs; do not authorize either real-money path in this
preparation phase. [PROPOSED]

---

## 21. Security/threat model

| Threat | Mitigation |
|---|---|
| Agent overspend / runaway loop | Pre-pay policy check + per-tx/daily/monthly limits + kill switch; ledger counters |
| Compromised/rogue agent | Limits, ledger, kill switch; agent holds no keys |
| Wallet key compromise | Autonomous wallet keys human-held; agent never holds or sees them |
| Merchant impersonation | Agent verifies canonical URL + `payTo` + expected price from the allowlist before paying |
| Facilitator compromise/misquote | On-chain settlement verification; receipt cross-check |
| Replay / double-spend | EIP-3009 nonce idempotency; ledger nonce reservation; verify-before-retry (§10) |
| Poisoned policy store | Policy is human-written and immutable by the agent; agent has no policy-write access |
| Ambiguous settlement exploited | "unknown" always triggers verification, never re-purchase (§10) |

[PROPOSED threat model for the A1/A2 harness.]

---

## 22. Observability requirements

- **Ledger completeness:** every §7 state transition logged (the §11 schema); append-only.
- **Metrics:** transactions, spend vs limits (per-tx/daily/monthly), retry rates, settlement
  statuses, ambiguous-case count, service-failure rates, dispute counts.
- **Alerts:** limit proximity (e.g., ≥80% daily ceiling), any "unknown settlement" without
  verification, kill-switch activation, reconciliation discrepancies.
- **Reproducibility:** every transaction replayable from the ledger (request, price, decision,
  payment id, settlement, result). [PROPOSED]

---

## 23. Rollback / emergency controls

1. Kill switch (disable commerce / per-service / suspend payments).
2. Autonomous wallet freeze (human-held keys).
3. Credential revocation (facilitator/API credentials for the autonomous identity).
4. Policy revert (human restores the previous signed policy).
5. Ledger as the recovery record (reconcile → refund where supported → evidence for disputes).

[PROPOSED — exercised as part of every stage gate from A2 onward.]

---

## 24. What must remain human-controlled

Eligible services · spend limits (per-tx/daily/monthly) · currency/network eligibility ·
counterparty/merchant rules · kill switch · policy changes · dispute escalation beyond the
boundary · mainnet activation (A3 gate) · registration actions (x402scan etc.) · recruitment of
external agents (A5) · SiteHealth commercial terms.

## 25. What can become autonomous

Service selection within the allowlist · price acceptance ≤ ceiling · payment execution ·
retry within limits · failure classification/handling · dispute classification + refund request
+ evidence preservation (within the boundary) · continue-to-next-transaction.

## 26. What is explicitly prohibited (this phase and until separately authorized)

- Any real (mainnet) autonomous spend.
- Activating autonomous wallets.
- Modifying production payment limits.
- Exposing unrestricted autonomous purchasing.
- Registering new services without approval.
- Contacting external agent operators.
- Charging anyone.
- Altering SiteHealth commercial terms or VAT API production.
- Bypassing x402scan or the paidTool/Zod dependency issue via unreviewed workarounds.
- Reopening Cycle 3.

---

## 27. Implementation prerequisites

1. **Policy store** — human-written, agent-read-only, versioned/signed: allowlist, ceilings,
   retry/dispute rules, kill flag (§4–6, §12).
2. **Autonomous wallet** — testnet first; keys human-held (§12).
3. **Transaction ledger** — D1 table per §11 + spend counters.
4. **Kill-switch controls** — §12 (disable/pause/freeze/revoke).
5. **State-machine reference implementation** — §7 (deterministic; the A1 harness target).
6. **A1 simulation harness** — deterministic scenario runner (selection, price, retry, failure,
   ambiguous settlement).
7. **A2 testnet harness** — real agent against the VAT API surface on testnet.

None of these are authorized to build in this phase; they are the prerequisites the A3-gate
request would cover. [PROPOSED]

---

## 28. Open decisions requiring Daniel's approval

See §29 — every row is DSH's recommendation pending Daniel's decision. Nothing in this plan
proceeds without approval.

---

## 29. Decision table

| Decision | Recommendation | Status |
|---|---|---|
| Autonomous transaction definition | Move transaction-level decisions to pre-authorized machine policy; human sets the policy (§2–3) | **Proposed** |
| Spending ceiling | Per-tx $1 / SiteHealth $1 / VAT API $0.25 / daily $5 / monthly $50 — enforcement architecture designed; **values to confirm** (§5) | **Daniel approval** |
| Eligible services | ALLOW {SiteHealth Passport, VAT API}; DENY arbitrary/experimental/admin (§6) | **Daniel approval** |
| Mainnet activation | Preparation only — first controlled mainnet autonomous tx is the separate A3 gate (§16) | **NOT AUTHORIZED** |
| First autonomous service | VAT API as transaction-rails proving ground (§18, §20) | **Daniel approval** |
| VAT API role | Protocol/transaction proving ground (A2/A3) | **Proposed** |
| SiteHealth role | Higher-value commercial demonstration after rails proven; kept separate from the PATC human pilot (§19–20) | **Proposed** |
| x402scan response | Document external validator defect (evidence cited); do not modify Qzenta code to compensate; re-test later; treat registration as discovery convenience, not prerequisite (§13) | **Proposed** |
| paidTool response | Leave blocked on the zod conflict; no forced migration; re-check on x402-hono upgrades; autonomous rails run on HTTP+x402 (Layer A+B) meanwhile (§14–15) | **Proposed** |
| Validation threshold | Commercial bar (10/100/$100) + autonomous safety bar (§17): 0 unauthorized, 0 limit violations, 0 unreconciled, 0 preventable duplicates, 100% ledger coverage, 100% kill-switch tests, defined failure + ambiguous + service-retry + out-of-policy-rejection scenarios | **Proposed** |
| Kill switch | Mandatory, human-only, agent-proof by construction (agent holds no keys/policy-write) (§12) | **Daniel approval** |
| Autonomous wallet | Not activated; testnet-first design, keys human-held (§12, §27) | **NOT AUTHORIZED** |
| External autonomous agents | Not recruited; A5 only after A4 passes (§16) | **NOT AUTHORIZED** |
| Real autonomous spending | None — blocked until the separate A3 gate approves the first controlled mainnet transaction | **BLOCKED** |

---

*Nothing in this plan has been executed. All decision-table items await Daniel's approval; the
next authorization, if approved, should be a separate explicit gate for the first controlled
mainnet autonomous transaction.*

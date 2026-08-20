# SiteHealth Passport v2 — Gate 4 Preparation & Commercial Readiness Report

**Phase:** PREPARATION + DECISION SUPPORT ONLY. **Nothing in this report is executed.** Gate 4 is
NOT authorized by this document. No production migration, no production ground-truth load, no
production deploy, no pricing change, no x402 change, no DNS/Cloudflare/Vercel/Atlas/Sikatrix
change, no customer accounts, no charges, no cutover.
**Prepared by:** DSH, 20 Aug 2026. **For:** Daniel.
**Evidence base:** this session's verified artifacts (PR #3 `dsh/v2-content-accuracy`,
`GATE1/2/3` evidence docs, staging URL/versions, test runs, fixture + sikatrix scans, rulings) and
the recon report `SITEHEALTH-PASSPORT-RECON-REPORT.md` (Gate 0 basis).
**Label discipline:** every conclusion is CONFIRMED / STRONGLY INDICATED / PROPOSED / UNKNOWN.
Commercial figures are explicitly **pricing hypotheses**, not market-validated facts.

---

## 1. Current Gate 0–3 status

| Gate | Status | Evidence |
|---|---|---|
| Gate 0 — MVP scope (M1–M6), P0 = content-accuracy first | APPROVED | Recon report; approval message |
| Gate 1 — ground-truth store + approved facts (D1–D4 rulings) | APPROVED | `GATE1-IMPLEMENTATION-PLAN.md`; 5 facts approved (D3), D4 hard cap (≤35) |
| Gate 2 — build | COMPLETE, independently verified | 150/150 tests (tsc exit 0), PR #3 reviewed; 2 defects found by real verification & fixed |
| Gate 3 — isolated staging | CLOSED (Option C) | `GATE3-STAGING-EVIDENCE.md`; staging URL + versions below |

[All CONFIRMED — performed and re-verified in this session.]

**Gate 3 closure detail (CONFIRMED):** staging at `https://qzenta-sitehealth-staging.qzenta.workers.dev`
(worker `qzenta-sitehealth-staging`, version `63c28f94`, staging D1 `qzenta-sitehealth-staging`
id `1c973f63-…`, NOT the production `qzenta-sitehealth-history`). AC1 idempotency proven (local +
remote, second apply = clean no-op). Ground truth loaded (5 facts / 15 patterns / 5 approved).
AC7: served OpenAPI semantically identical to repo spec; pre-existing drift fixed. Fixture scan:
all checks pass incl. D4 cap. Determinism: byte-identical on re-run. Sikatrix re-probe: 2
critical UIF findings (177 vs 17712), informational items. Ruling: keep flagging R177.

---

## 2. What is technically proven

- Infra/security passport (single + batch), PASS/WARN/FAIL + 0–100, x402 gate, D1 history +
  deterministic change detection, version-gated comparator — COMPLETE and live since Cycles 1/2
  [CONFIRMED — live product code].
- Content-accuracy dimension (v2): ground-truth store (SELECT-only), deterministic figure
  extraction/normalization, mismatch/stale/contradiction/absent classification, site-scoped
  bounded crawl with same-URL dedupe, D4 hard cap — built, 150/150 tests, deployed + verified on
  isolated staging [CONFIRMED — this session].
- Real-world detection capability: the live sikatrix re-probe found the tax-calculator card
  stating "UIF rate capped at R177/month" vs the approved R17,712 ceiling (contradiction +
  mismatch, both critical) — content-accuracy catches the exact defect class it was built for,
  on real production content [CONFIRMED — scan output + ruling].
- Determinism and build-vs-prod: same input ⇒ identical findings; served spec == repo spec;
  deployed bundle == reviewed source [CONFIRMED — staging checks, Gate 3 acceptance].
- Ground-truth governance: human-approved facts only; the R177 judgment call went to Daniel and
  was ruled "keep flagging" without scanner changes — the human-only rule operates as designed
  [CONFIRMED].

---

## 3. What remains unverified

| Item | State | Impact |
|---|---|---|
| Genuine end-to-end x402 paid transaction | NOT completed (Gate 3 closed Option C; payer faucets exhausted; merchant wallet has 0 base-sepolia ETH) | Payment rail unverified; does NOT block an invoice-funded pilot (§14) |
| Production D1 migration + ground-truth load | NOT performed (staging-only) | Gate 4 scope |
| Production worker deploy | NOT performed (staging-only) | Gate 4 scope |
| Production behavior (persistence, change detection on the live store) | NOT performed | Gate 4 scope |
| Customer willingness-to-pay / price points | NO market data | All prices in §7 are hypotheses |
| FP rate over a monitored period | Not yet recorded as a metric (Gate 3 produced one real judgment case: R177, ruled a true finding) | Pilot metric (recon §14 recommendation stands) |

[All UNKNOWN/not-performed except the x402 state, which is CONFIRMED-unverified per Gate 3.]

---

## 4. Commercial MVP definition

Translate M1–M6 into a customer proposition, classified by release stage. Do not expand the MVP
merely because features exist.

**Customer proposition (one sentence):** *"SiteHealth Passport continuously audits your public
website — security/infrastructure AND the compliance figures your clients read — and tells you,
in plain verdicts and a tracked history, the moment something drifts."*

| Capability (M#) | First paid pilot | General availability | Can wait |
|---|---|---|---|
| M1 single-site passport (infra/security scan) | **REQUIRED** | REQUIRED | — |
| M3 content-accuracy dimension | **REQUIRED** (the differentiator; highest-severity producer) | REQUIRED | — |
| M4 history + change detection | **REQUIRED** (evidence + recurrence story) | REQUIRED | — |
| M5 content-aware verdict | **REQUIRED** (one field a human/agent can act on) | REQUIRED | — |
| M6 x402 agent delivery | **REQUIRED as architecture**; *not required as the pilot's billing mechanism* (§14) | REQUIRED | — |
| M2 portfolio/batch scan | optional-enhancement (needed only if pilot 1 is multi-site) | REQUIRED | — |
| Alerts (PLANNED) | REQUIRED for pilot (simple email) — the recurrence loop needs a notify stage | REQUIRED | — |
| Customer report (thin, PDF/email from existing JSON) | REQUIRED (packaging layer) | REQUIRED | — |
| Portal/dashboard, remediation auto-fix, SEO dimension, code-quality dimension, monitoring infra at scale | — | — | **CAN WAIT** (§13) |

[Stage classification PROPOSED; capability existence CONFIRMED. "Do not expand" honoured: portal,
SEO, code-quality, remediation productisation are all deferred even though adjacent capability
exists.]

---

## 5. Initial ICP

**Initial ICP (prioritised, not "any website owner"):**
> South African SME accounting / professional-services firms (accounting practices, payroll
> bureaus, tax practitioners, and adjacent regulated professionals: law, financial advisory) with
> a compliance-sensitive public website, no in-house web/compliance audit capacity, and
> client-facing exposure to wrong figures.

- STRONGLY INDICATED — Sikatrix is a completed pilot of exactly this ICP: the highest-severity
  defect found was a money-integrity bug on a public calculator plus site-wide contradictory
  compliance figures, and the post-remediation re-probe still found a live compliance-content
  issue (R177 card). The problem class is demonstrated on a real firm's site, not hypothetical.
- PROPOSED — the exact sub-segment (accounting first vs payroll/law) and whether SA-only or
  broader; confirm at pilot 2 (recon §14 recommendation).
- Deliberately NOT the ICP: "any website owner" (no recurring compliance pain), dev agencies
  (different buying motivation), enterprises (out of reach for v1).

---

## 6. Customer problem and value proposition

**Customer (explicit — who, not "any website owner"):** the SA SME accounting /
professional-services firm from §5 (accounting practices, payroll bureaus, tax practitioners;
adjacent regulated professionals later). Concretely: the partner/owner who owns the compliance
risk of their public site and the web content it publishes, has no in-house web or compliance
audit capacity, and cannot staff "check our own figures" as a recurring activity. The buyer is
the firm principal (or the agency principal managing the book of sites), not an IT department —
there is no IT department. [STRONGLY INDICATED from the Sikatrix pilot; PROPOSED framing.]

**Problem (recurring, not one-off):** a firm's public site is its compliance front door. Wrong
money figures, contradictory VAT/ROE/EMP501 statements, security-header regressions, and stale
deployments are (a) undetectable by the firm, (b) independently unverifiable by their clients,
and (c) a recurring risk that does not go away after one audit — content and infra drift
continuously. [CONFIRMED problem-class: sikatrix audit + re-probe evidence; PROPOSED framing.]

**Value proposition (avoiding "AI website scanning"):**
> *"SiteHealth Passport is the firm's independent, continuously-updated compliance-and-health
> record for its public website — wrong figures caught against human-approved regulatory ground
> truth, security drift caught as it happens, every finding evidenced, every change tracked, and
> every verdict explained to a human or an agent in one field."*

**Outcome the customer pays for every month:**
1. **Wrong-money / wrong-advice defects caught before clients see them** (the UIF-×12 class; the
   R177 card class) — against maintained, human-approved facts, not a generic LLM guess.
2. **A tracked health history** (passport-style record: score over time, changes detected,
   evidence per finding) — proof for partners, insurers, buyers, or the firm's own governance.
3. **Detected regression the moment it happens** (content figure changed, header removed,
   redeploy gone stale) — the change-detection loop.
4. **A single LLM/human-consumable verdict** per site (PASS/WARN/FAIL + score) — no second
   reasoning pass needed.

**Recurrence (why the customer keeps paying after the first audit):** the product is a monitor,
not an audit. First month = baseline; every subsequent month = new detections, changes vs the
record, and the accumulating evidence trail. The subscription buys continuity (frequency +
retention + alerts), which a one-off audit cannot provide. [PROPOSED — recurrence is the
commercial thesis; validated in pilot.]

**Customer/Problem/Outcome/Recurrence in one line (for the sales sheet):** *"Your site, your
clients' first impression of your numbers — monitored continuously against approved facts, so a
wrong figure never reaches them."* [PROPOSED copy, not tested]

---

## 7. Content-Accuracy pricing options

**Units explicitly NOT assumed:** per-scan is only one candidate. Units considered: website,
monitored website, scan frequency, monitored pages, dimensions, history retention, alerts,
remediation, verified remediation, portfolio size. All prices below are **pricing hypotheses**
(no market validation; SA-market anchors for SMEs; ZAR≈R18/$1).

### Model A — Subscription per monitored website (monthly, flat)

- **Customer proposition:** one site, continuously monitored, one predictable monthly fee.
- **Included:** weekly content-accuracy + infra/security scans; 12-month history + change
  detection; PASS/WARN/FAIL verdicts; email alerts on critical changes; quarterly human review
  of the firm's compliance figures (ground-truth check); the evidence record (report export).
- **Excluded:** unlimited pages (cap ~25 pages/site in v1); verified-remediation guarantee;
  legal/tax advice; SLA/uptime guarantee; agent/API access (higher tier).
- **Operational burden:** automated scans + scheduled report generation (agent-assisted); ground
  truth is shared infrastructure (one review, all customers benefit); per-customer effort ≈
  setup (baseline scan) + quarterly content review + alert routing.
- **Scalability:** near-linear per site; the moat (ground truth) amortises across all customers.
- **Advantages:** predictable recurring revenue; maps to the recurrence thesis; simple to sell.
- **Disadvantages:** monthly price must cover continuous cost; customers may think "an audit is
  one-off" — selling the monitor not the audit is the pitch.
- **Use case:** the firm channel — recommended anchor for pilot 1 and GA.
- **Price hypothesis:** R499/month (~$28) single-site Professional content tier; discounts for
  annual prepay.

### Model B — Usage-based per content scan (volume pricing, x402-aligned)

- **Customer proposition:** pay only for what you scan — agents and integrators per call.
- **Included:** per-call content-accuracy scan via the API (single or batch), free history/
  changes reads; x402 payment rail (testnet today).
- **Excluded:** monitoring continuity, alerts, retention guarantees, human ground-truth review
  (all subscription features).
- **Operational burden:** minimal (existing per-call infra); billing via x402 when mainnet-ready.
- **Scalability:** perfect for agent-driven volume; no per-customer ops.
- **Advantages:** aligns with the existing x402 architecture; zero commitment; right for agents.
- **Disadvantages:** spiky, unpredictable revenue; doesn't deliver the firm's recurrence outcome;
  unverifiable rail today (x402 finding).
- **Use case:** the agent/API channel — later (post-pilot); NOT the firm channel.
- **Price hypothesis:** R1–R9/scan (~$0.05–0.50) per content scan (infra scan stays $0.01);
  volume tiers at 100+/mo.

### Model C — Portfolio subscription (site-count tiers, agency/group)

- **Customer proposition:** monitor the whole book of client sites from one place.
- **Included:** 2–10 sites per portfolio; weekly scans per site; consolidated portfolio report
  + per-site verdicts; alerts; shared history.
- **Excluded:** per-site custom compliance-figure sets beyond the shared ZA ground truth
  (custom fact sets = Professional+ feature); white-labeling.
- **Operational burden:** same as A × sites, plus consolidated reporting (agent-assisted);
  on-boarding a portfolio = one batch baseline.
- **Scalability:** linear in sites; the batch scan (M2) makes it cheap to add sites.
- **Advantages:** highest contract value; agency/group ICP expansion; leverages M2.
- **Disadvantages:** more complex sales + support; multi-site = more FP/noise surface.
- **Use case:** GA phase 2 / the second pilot if it is an agency.
- **Price hypothesis:** from R2,499/month (~$140) for up to 10 sites.

**Recommendation (PROPOSED):** anchor on **Model A** (per-monitored-website subscription) as the
first paid pilot's price, with Model C as the natural scale-up and Model B as the agent channel
that inherits the same pipeline. Do not set per-scan as the primary unit for the firm channel.
[All three models and the price figures are PROPOSED pricing hypotheses; willingness-to-pay is
UNKNOWN until pilot — no market data exists.]

---

## 8. Recommended package structure

Assess Basic/Professional/Portfolio; recommend the **smallest** structure that makes commercial
and operational sense.

| Package | Sites | Scan frequency | History | Content-accuracy | Alerts | Report | Anchor price (hypothesis) |
|---|---|---|---|---|---|---|---|
| **Basic** | 1 | monthly | 90 days | infra/security only | critical-change email | monthly digest | R299/mo (~$17) |
| **Professional** | 1 | weekly | 12 months | **content-accuracy + infra/security** | critical + material email | quarterly evidence report + monthly digest | R499/mo (~$28) |
| **Portfolio** (GA phase 2) | 2–10 | weekly | 12 months | per-site content + infra | all | consolidated | from R2,499/mo (~$140) |

**Recommendation:** ship **Basic + Professional** for the first pilot; add **Portfolio** only when
the second pilot or an agency appears. The differentiation that justifies Professional is
precisely the content-accuracy dimension + history + alerts — the things this v2 built.
[Package structure PROPOSED; names provisional.]

---

## 9. First commercial pilot

**Recommendation: Sikatrix is BOTH the internal reference site AND the first paying pilot** —
then one external accounting-practice pilot before GA. [PROPOSED]

**Explicit evaluation of Sikatrix's role (all four options weighed, not just the conclusion):**

| Option | Assessment | Verdict |
|---|---|---|
| (a) Internal reference site only | Zero commercial risk; lets us exercise the full loop on ourselves. But it tests *our own* property and validates nothing about willingness-to-pay, comprehension, or market fit — it is necessary, not sufficient. [PROPOSED] | Yes, as a role — not the only one |
| (b) First paying pilot only (no internal-repo role) | Would skip the free self-testing of billing/alerting/reporting, risking a paid customer being the first to hit operational bugs. [PROPOSED] | No — internal testing must precede paying |
| (c) Both internal reference + first paying (recommended) | The live R177 finding (ruled "keep flagging" post-remediation) means the product demonstrably finds what the firm itself missed — the strongest possible demo of the recurring value; the firm is a real buyer with real exposure; setup cost is ~zero (own site, ground truth already approved). Caveat: WTP measured on our own property is not neutral market evidence. [CONFIRMED evidence; PROPOSED choice] | **Recommended** |
| (d) Both + one external pilot before/parallel | The external accounting-practice pilot neutralises the (c) caveat — generalisability + WTP on a site we don't own. Not needed to START (c); needed before GA. [PROPOSED] | Yes, sequenced after (c) |

**Why (c) is not sufficient alone:** it is our own property — willingness-to-pay and comprehension
can't be validated neutrally on ourselves. Hence **one external pilot** (an accounting practice
per the ICP, 1–3 sites) to validate generalisability + WTP before GA. Sequencing: Sikatrix pays
first (validates the commercial loop end-to-end, incl. billing §14), external pilot validates
the market. [PROPOSED]

Rationale for Sikatrix as first paying pilot [CONFIRMED evidence]:
- Already independently audited (P0:4/P1:9/P2:9/P3:8/P4:4), remediated, merged, deployed;
- content-accuracy dimension already tested against it; a **live finding still exists after
  remediation** (R177 card — ruled "keep flagging"), so the product demonstrably finds things
  the firm missed;
- historical evidence exists to compare against (the v2 scan + the Cycle 1 audit);
- zero marginal setup (own site, own ground truth already approved).

**Pilot success criteria (§18 metrics):** genuine findings count, FP rate (recorded from pilot
onward), verification effort per finding, time saved vs the firm's prior practice, remediation
success, recurrence/regression detection, customer comprehension (does the verdict/report read
clearly?), willingness to pay (upgrade/retention intent), retention intent at month 3.

---

## 10. Production migration plan — D1 (PREPARE ONLY)

Scope: the production D1 is `qzenta-sitehealth-history` (live Cycle-2 store). Migration = schema
0002/0003 + ground-truth load. Nothing below is executed.

| Step | Detail | Evidence source |
|---|---|---|
| Schema changes | `0002_ground_truth.sql` (ground_truth + fact_patterns, unique upsert index), `0003_content_columns.sql` (4 content summary columns on snapshots) | Migrations in PR #3; 0001 immutable |
| Migration order | `wrangler d1 migrations apply qzenta-sitehealth-history --remote` — applies 0001 (already), 0002, 0003 in order | Proven identical on staging D1 (AC1) |
| Backup requirements | D1 time-travel restore point before any write (document the chosen restore window); export the snapshots/changes tables via `wrangler d1 export` for a portable backup | Standard D1 tooling |
| Rollback strategy | Migrations are additive-only (new tables + ADD COLUMN) → rollback = no schema reversal needed; ground truth rollback = DELETE the loaded rows (loader is idempotent upsert); worst case restore from backup | Schema is additive by design |
| Data validation | Post-migration SELECTs: 5 facts / 15 patterns / 5 approved (`approved_by = 'Daniel Amoah'`); pattern kinds (context 5 / keyword 4 / value 6); no rows in the LIVE store touched except the new tables/columns | Re-run the staging verification SQL |
| Approved five-fact load | Generate SQL via `scripts/load-ground-truth.ts` (20 bare upserts — D1 rejects BEGIN/COMMIT, fixed), verify hash + statement count against the Gate-2-reviewed output, execute against the production D1 only under Gate 4 approval | Loader + staging evidence |
| Post-migration verification | Counts + a content scan reading ground truth from production (see §12) | §12 D3 |

## 11. Production worker deployment plan (PREPARE ONLY)

| Step | Detail |
|---|---|
| Artifact/version | Merge PR #3 (`dsh/v2-content-accuracy` → `main`) at the exact reviewed commit; the Gate 3-verified version `63c28f94` corresponds to commit `96ccd8c` — pin the deploy to the merged main head and record the version id |
| Configuration | Existing production `wrangler.jsonc` (worker `qzenta-security-snapshot`, custom domain `sitehealth.qzenta.com`, D1 `qzenta-sitehealth-history`, rate limits, X402 vars) — the v2 code needs **no new config**: the content dimension reads ground truth from the existing `HISTORY_DB` binding |
| Required secrets | None new (X402_PAY_TO is a var; no key in the Worker by design) |
| Permissions | Scoped Workers token (Scripts:Edit) as used for staging; D1 edit permission for the migration step |
| Deployment sequence | 1) merge PR → 2) D1 migration (§10) → 3) ground-truth load (§10) → 4) `wrangler deploy` (production config) → 5) post-deploy verification (§12) |
| Health checks | `GET /` (discovery), `GET /openapi.json` (spec semantic-identical), `GET /history?domain=…` / `/changes` (D1 reads live), 402 shape intact |
| Rollback mechanism | Worker: `wrangler rollback` to the previous version (v1 bundle) — content blocks absent ⇒ v1 behavior restored; D1: additive-only + backup (never require code rollback to undo data) |

## 12. Post-deployment verification plan (D3)

Exact evidence required to establish production is working:

| Evidence | Method | x402-dependent? |
|---|---|---|
| Content-accuracy detection works | Production scan of the fixture (wrong figures) + sikatrix (real findings) — via the **internal scheduled-scan path** (cron-invoked pipeline, §14), which runs the same `runSecuritySnapshot` code the paid endpoint uses | **no** — the internal path needs no payment; the paid endpoint is an *optional* extra, not the evidence basis |
| D4 hard-cap behavior | Fixture scan: content.score ≤ 35, dimension FAIL, verdict FAIL despite clean security | no (internal path) |
| Determinism | Same URL scanned twice via the production pipeline → byte-identical findings | no |
| Historical persistence | `/history?domain=…` returns stored v2 snapshots with content columns | no (free read) |
| Change detection | Second scan writes a `changes` record with content fields; `/changes` exposes provenance | no |
| Production bundle identity | Record deploy version id; served `/openapi.json` semantic-identical to merged main spec | no |
| Expected response behavior | Discovery JSON, 402 challenge shape, error shapes (400/429) unchanged from v1 | **no** — the 402 challenge is observable *without* payment (call the endpoint, read the 402). Only a hypothetical post-payment 200 response would be x402-dependent, and that is an optional extra, not a criterion |
| Failure handling | Ground-truth store unavailable → degraded "Content scan skipped" finding note, scan still returns (locked decision) | no |

**Correction (20 Aug 2026, re-verified):** every D3 evidence row above is checkable **without a
completed x402 payment** — via the internal scan path (identical code) and the free endpoints/
read paths. Nothing in the D3 plan is gated on payment.

---

## 13. Proposed Gate 4 acceptance criteria (checklist)

Gate 4 does not close on "deploy succeeded". Evidence required per criterion:

1. **Production schema/migration correctness** — migrations applied; idempotency re-run clean;
   D1 export/backup recorded. [CONFIRMED method from staging AC1]
2. **Approved ground-truth facts loaded correctly** — 5/15/5 SELECTs, approver metadata,
   pattern kinds. [Same SQL as staging]
3. **Worker deployed correctly** — version id matches merged commit; rollback path recorded.
4. **Content-accuracy dimension operating in production** — fixture + sikatrix findings
   reproduced through the production pipeline (internal scan path — see x402 note).
5. **Critical findings trigger D4 hard-cap** — fixture scan: score ≤35 / FAIL / verdict FAIL.
6. **Passport history persists** — `/history` returns v2 snapshots with content columns.
7. **Change detection behaves** — `/changes` records content field diffs with provenance.
8. **Determinism** — double scan byte-identical.
9. **Production bundle matches verified build** — served spec ≡ merged spec; version pinned.
10. **No regression of the infra/security dimension** — v1 test suite (87 baseline) green on
    the merged code; live 402/discovery shapes unchanged.
11. **Rollback remains possible** — wrangler rollback rehearsed on staging; D1 restore plan
    documented (not executed).
12. **Evidence bundle complete** — this checklist, scan outputs, SELECT results, version ids,
    spec diff, committed in the repo (docs) for reproduction.

**x402-dependent criteria — CORRECTED (20 Aug 2026): none of the 12 criteria require a completed
x402 payment.** Re-verified against the D3 plan: #4 (content-accuracy operating in production) is
exercised via the internal scheduled-scan path (same `runSecuritySnapshot` code the paid endpoint
runs, minus the HTTP gate) and read back through the free `/history`/`/changes` endpoints; #10
(no infra/security regression) is verified by the v1 suite on merged code plus free endpoint
shapes (including the 402 challenge, which is observable without paying). The only thing that
requires a completed payment is the optional paid-200-path check — explicitly NOT a Gate 4
criterion. Gate 4 can close on evidence that does not fabricate payment readiness: the x402 paid
handshake remains a standing cross-program open item (§14), tracked separately, never implied
verified by Gate 4 closure.

---

## 14. x402 dependency and alternative payment options

**Standing cross-program finding (CONFIRMED per Gate 3 + this handoff):** *no Qzenta
agent-commerce service (SiteHealth OR the Sikatrix VAT API) has completed one genuine end-to-end
x402 paid transaction.* Gate 3 closed Option C explicitly because no payer was obtainable
(faucets exhausted; merchant wallet 0 ETH). Do not claim payment readiness; do not solve this
incidentally.

**Is x402 required for the first SiteHealth paid pilot?** **NO** [PROPOSED, architecture-safe].

- The x402 middleware only guards the public HTTP `/snapshot/*` surface. The scan pipeline
  (`runSecuritySnapshot`) is a plain function; a scheduled production scan (Cloudflare Cron
  Trigger, or a DSH-side scheduler) can invoke the same pipeline without the payment gate — the
  customer's invoice/EFT payment authorises the service; the cron executes it.
- This does not compromise architecture: x402 stays in place as the agent-facing rail; the pilot
  simply does not depend on it.

**Alternative payment options for the first pilot (ranked):**
1. **Invoice / EFT (recommended for pilot 1)** — fixed monthly invoice per the package (§8);
   zero new infrastructure; validates willingness-to-pay without the rail.
2. **x402 once a payer exists** — remains the eventual agent rail; verification scheduled as a
   standing follow-up (not this phase).
3. Manual wallet transfer — rejected for now (no testnet ETH; the 0.002 ETH attempt was
   blocked).

**Distinction to keep explicit:** "product can be commercially sold" (YES — invoice-funded
pilot) vs "x402 payment rail independently verified" (NO — open cross-program finding).

---

## 15. Cycle 3 boundary

Cycle 3 (base infrastructure-scanning) remains **blocked behind the separate Measurement Gate**
— unchanged, not reopened, not combined with this work. The current objective is only the
content-accuracy commercial/production path. [CONFIRMED — standing boundary.]

---

## 16. Minimum DSH dependencies

Classify only what SiteHealth actually needs (no generic orchestration infra):

**P0 — required before the first paid pilot:**
- Scheduled scan execution (cron trigger on the Worker, or DSH-side scheduler invoking the
  pipeline) — small, net-new; the pipeline itself exists [CONFIRMED].
- Ground-truth maintenance workflow (human sign-off per fact; quarterly review cadence) —
  proven as a practice on both threads [CONFIRMED practice, PROPOSED cadence].
- Alert delivery (email on critical/material changes) — net-new, thin (no portal).
- Report generation (monthly digest + evidence export from existing JSON/history) — agent-
  assisted, existing capability.
- Independent-verification discipline (Gate 0→4, never-self-report) — exists [CONFIRMED].

**P1 — pilot/GA [all PROPOSED]:**
- Portfolio scheduling + consolidated reporting; FP-rate tracking; second-pilot onboarding
  tooling; basic billing records (invoice tracking).

**P2 — future scale [all PROPOSED]:**
- Portal, multi-tenant isolation, self-serve signup, monitoring/alerting infra at scale,
  per-customer custom fact sets.

**Explicitly NOT needed:** generic agent-orchestration infrastructure, extra payment
infrastructure, additional local-model infra (Ollama stays out), elaborate portals. Product
drives DSH priorities, not the reverse.

---

## 17. Deferred capabilities (what NOT to build yet — mandatory)

| Capability | Status | Reason |
|---|---|---|
| Multi-agent orchestration | DEFER | Not required by the MVP; DSH itself is sufficient |
| Autonomous remediation | DEFER | Human approval mandatory (§11 handoff + governance); remediation stays authorization-gated |
| Additional local-model/Ollama infra | DEFER | Handoff §5 unchanged; no role in the proven pipeline |
| Elaborate customer portals/dashboards | DEFER | Email/PDF reporting suffices for pilot; portal is P2 |
| Broad SEO dimension expansion | DEFER | P1/P2 (§12 recon); not in the commercial MVP |
| Excessive dashboarding/telemetry | DEFER | Structured logs exist; no product dashboard until customers demand it |
| Multi-tenant complexity beyond MVP | DEFER | Pilot = per-firm portfolios; no self-serve |
| Advanced agent routing / discovery expansion | DEFER | x402 registration is gated on the payment question |
| Additional payment infrastructure | DEFER | Invoice/EFT covers pilot 1 (§14) |
| Unnecessary integrations | DEFER | No new systems until a customer asks |

Purpose: prevent technical expansion from delaying commercial validation. [All PROPOSED
deferrals; capability-existence notes CONFIRMED.]

---

## 18. Pilot success metrics

Define at pilot start, measure monthly (Sikatrix + external pilot):

| Metric | Definition | Baseline/data point |
|---|---|---|
| Genuine findings | confirmed findings (Daniel-ruled) per scan cycle | Sikatrix re-probe: 2 critical UIF + informational (CONFIRMED); R177 ruled true |
| False-positive rate | FP / (FP+TP) per cycle | Not yet recorded — first recorded value is a pilot deliverable (UNKNOWN until then) |
| Verification effort | time per finding to independently confirm | Sikatrix Gate 3: extraction deterministic; judgment calls go to Daniel (qualitative) |
| Time saved | firm's prior effort vs passport effort | UNKNOWN — measure in pilot |
| Remediation success | % findings fixed + production-verified | Sikatrix Cycle 2: same-day turnaround precedent (CONFIRMED) |
| Recurring issues detected | regressions caught after a "clean" state | R177 card survived remediation → recurrence evidence exists (CONFIRMED) |
| Customer comprehension | firm can read verdict/report without help | Measure in pilot (qualitative) |
| Willingness to pay | upgrade / renew intent | UNKNOWN — the pilot's core unknown |
| Retention intent | month-3 renewal intent | UNKNOWN |

---

## 19. Open decisions requiring Daniel's approval

1. **Pricing model** — Model A (per-site subscription) as anchor? Price hypotheses in §7/§8?
2. **Package structure** — Basic + Professional for pilot; Portfolio later? Names/prices?
3. **ICP confirmation** — accounting/professional-services SA SME, as in §5?
4. **First pilot** — Sikatrix paying + one external accounting-practice pilot (sequencing)?
5. **Pilot billing** — invoice/EFT for pilot 1 (§14 option 1) vs wait for x402?
6. **Alert channel + frequency** — email, weekly scans, critical/material thresholds (defaults in
   §8)?
7. **History retention default** — 12 months Professional / 90 days Basic?
8. **Gate 4 authorization** — production migration (§10), deploy (§11), verification (§12–13) —
   each a separate explicit approval, not implied by this report.

---

## Appendix A — Commercial evidence loop (handoff §11)

The product operates as a closed loop. Each stage is classified **automated** (runs without
human attention), **agent-assisted** (DSH/agent executes, human reviews/approves where marked),
or **human-approved** (a named human must act). Principle preserved: *agents provide capability;
DSH provides authority.*

```text
Baseline → Detect → Independently verify → Record → Customer notified →
Remediate (where authorised) → Production verify → Passport updated → Monitor →
Detect change/regression → (repeat)
```

| Stage | Classification | How | Evidence/notes |
|---|---|---|---|
| **Baseline** | automated + human-approved ground truth | First scan writes the passport record; ground-truth facts are already human-approved (D3) | CONFIRMED — pipeline + 5 approved facts |
| **Detect** | automated | Scheduled scan (cron/DSH scheduler) runs the content + infra pipeline | CONFIRMED — code proven on staging |
| **Independently verify** | agent-assisted → human-approved on judgment calls | Extraction is deterministic; regulatory figures are re-checked against approved ground truth; content judgments (e.g., R177 card) go to Daniel | CONFIRMED — never-self-report; R177 ruling |
| **Record** | automated | Snapshot + change rows written to D1 (version-gated, materiality-tiered) | CONFIRMED — staging persistence verified |
| **Customer notified** | automated (email on critical/material) | Alert from the change record; templates human-approved once | PROPOSED — alert layer not yet built (P0) |
| **Remediate (where authorised)** | human-approved → agent-assisted execution | Firm authorises; DSH proposes a PR/fix; deploy only with owner sign-off | CONFIRMED practice (sikatrix Cycle 2, PRs #7/#8); productised auto-fix DEFERRED |
| **Production verify** | automated + human spot-check | Re-scan after deploy; build-vs-prod compare; firm confirms | CONFIRMED method (staging D3) |
| **Passport updated** | automated | Verdict/score/history refresh; evidence trail accumulates | CONFIRMED — history/change design |
| **Monitor / detect regression** | automated | Recurring scans compare against the record; regressions (e.g., a "clean" site later stating a wrong figure) surface as changes | CONFIRMED — the R177 case survived remediation, demonstrating the regression class |

Boundary: agents (DSH) execute detection/verification/reporting; **authority** (approving
ground-truth facts, judging content findings, authorising remediation/deploy/pricing) stays
human. [PROPOSED loop; stage-classification PROPOSED; capability evidence CONFIRMED.]

---

## Final decision gate

| Decision | Recommendation | Evidence/Rationale | Daniel approval required? |
|---|---|---|---|
| Content-Accuracy pricing | Model A (per-monitored-website monthly subscription) as anchor; Model B agent channel later; Model C portfolio at GA phase 2 — prices are hypotheses (Basic R299, Professional R499, Portfolio from R2,499 ZAR/mo) | Recurrence thesis (§6, PROPOSED); units analysis (§7, PROPOSED); smallest structure (§8, PROPOSED) | **YES** |
| First commercial ICP | SA SME accounting/professional-services firms with compliance-sensitive sites | Sikatrix pilot evidence (§5, STRONGLY INDICATED) | **YES** |
| First pilot | Sikatrix paying (internal reference + first customer, option (c)) then one external accounting practice (option (d)) | Live findings post-remediation (CONFIRMED); self-site WTP caveat (§9, PROPOSED) | **YES** |
| Production migration | D1 0002/0003 + approved 5-fact load, additive-only, backup+rollback documented (§10) | Staging AC1 + load verified (CONFIRMED, §10) | **YES** |
| Worker deployment | Merge PR #3 → pin version → deploy with existing production config (§11) | Gate 3-verified bundle `63c28f94`/`96ccd8c` (CONFIRMED, §11) | **YES** |
| x402 dependency | Pilot bills by invoice/EFT; x402 remains unverified agent rail; no payment-readiness claims (§14) | Gate 3 Option C (CONFIRMED); cross-program finding (§14, CONFIRMED) | **YES** |
| Cycle 3 | Remain blocked behind the Measurement Gate; not combined with this work | Standing boundary (§15, CONFIRMED) | **NO change** |
| Additional DSH build | P0 only: cron scheduling, alert email, report generation, FP tracking; no orchestration/portal/payment infra (§16–17) | Product drives DSH priorities (§16, PROPOSED) | **YES** |

---

*Nothing in this report has been executed. Every item above requiring approval awaits Daniel's
decision; the smallest evidence-backed product, its price, and the minimum production/DSH
capability are now specified for that decision.*

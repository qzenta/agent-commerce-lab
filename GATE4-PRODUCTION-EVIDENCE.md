# Gate 4 — Production Evidence: Migration, Deploy, Verification

**SiteHealth Passport v2 — content-accuracy dimension + pilot P0 operations (20 Aug 2026)**
**Status:** GATE 4 EXECUTED per Daniel's authorization. Production is live. x402 paid handshake
remains unverified (standing cross-program open item — NOT a Gate 4 criterion).
**Executed by:** DSH. **Evidence discipline:** every item CONFIRMED by the outputs recorded here
(SHAs, version ids, live endpoint reads, D1 SELECTs).

---

## 0. Scope executed (authorized)

- Production D1 migration + ground-truth load (§10)
- PR #3 merge to main + production worker deploy pinned to the merged commit (§11)
- Post-deployment verification — full D3 evidence set (§12)
- Gate 4 checklist, all 12 criteria (§13) — none require a completed x402 payment
- Pilot P0 DSH dependencies (§16): scheduled scans (cron), alerts, report digest, FP-review
  scaffold

NOT executed (not authorized): pricing changes externally, customer accounts, charges, x402/DNS/
account-level changes beyond the deploy itself, Cycle 3.

---

## 1. Production migration + ground truth (CONFIRMED)

| Item | Evidence |
|---|---|
| Pre-migration backup | `backup-pre-gate4.sql` (1474 B) exported from `qzenta-sitehealth-history` (id `f75cc7c4-33a9-4e83-950f-fb7280747fe3`); Cloudflare R2 copy (1h link) recorded in session log |
| Migrations | `0002_ground_truth.sql`, `0003_content_columns.sql`, `0004_ops_tables.sql` applied to the **production** D1 — all ✅; second apply: `✅ No migrations to apply!` (idempotency on production) |
| Ground-truth load | `scripts/load-ground-truth.ts` output verified before execution (20 bare upserts, no BEGIN/COMMIT — D1-safe); SHA256 `3070809A80A3D5422E13D019167B34E2E9DD32B4EE9A7D4FDE8168709214FDA1`; loaded to production D1 |
| Validation SELECTs | `facts=5, patterns=15, approved=5, current_facts=5` |

## 2. Merge + deploy (CONFIRMED)

| Item | Evidence |
|---|---|
| PR | https://github.com/qzenta/agent-commerce-lab/pull/3 squash-merged to `main` |
| Main commit | `5bf54ae6fd6b937e99e653b6cabc53c7d1586e3d` — "Add content-accuracy dimension: … (v2) (#3)" |
| Production worker | `qzenta-security-snapshot` (serves `sitehealth.qzenta.com`) |
| Verification-window deploy | version `ff9fc04d-559a-4954-a372-2d8e5b7dfc56` (cron `*/2`) — used to gather §3 evidence |
| Final deploy | version `06a89bff-2e13-4fc1-ac28-c594470cdd2f`, schedule `0 6 * * 1` (weekly Mon 06:00 UTC) |
| Config | production `wrangler.jsonc` — `MONITOR_DOMAINS=https://www.sikatrix.com/` (pilot scope); `ALERT_WEBHOOK_URL` unset (delivery activates when configured); no new secrets (X402_PAY_TO is a var) |

## 3. Post-deployment verification — D3 evidence set (CONFIRMED, live reads)

All reads below are against production (`https://sitehealth.qzenta.com`) via the free endpoints /
internal scan path. Monitored domain: `www.sikatrix.com` (the first paying pilot site).

**Content-accuracy detection (criterion 4):** production cron scan → 9 pages crawled;
`GET /findings?domain=www.sikatrix.com` → **9 findings**, including both critical findings from
the pre-deploy verification, reproduced in production:
- `[critical] cross-page-contradiction | za.uif.monthly_ceiling_zar | claim 177 / 17712`
- `[critical] figure-mismatch | za.uif.monthly_ceiling_zar | page /tools/tax-calculator | claim 177`
- 7 informational absent-required-figure (UIF + EMP501 topic pages)
- All `review: pending` — rulings are Daniel's to record via `POST /findings/review` (human-only).

**D4 hard-cap (criterion 5):** latest snapshot: `contentScore 5, contentStatus FAIL, verdict FAIL
(5/100)` while `headerScore 80 (B)` — the critical money-figure findings cap the content score at
≤35 and the verdict blends to FAIL despite a clean security side. Confirmed on the production
internal scan path.

**History persists (criterion 6):** `GET /history?domain=www.sikatrix.com` → 3 snapshots
(snapshot-v3, complete, content columns populated: 13:38 / 13:40 / 13:42 UTC).

**Change detection (criterion 7):** `GET /changes` → 2 records with full provenance
(scanner/scoring versions, comparable=true, "same scoring model"); materiality informational,
scoreDelta 0, no changed fields — CORRECT: the site's state is stable between ticks (baseline
critical findings are findings, not changes).

**Determinism (criterion 8):** content scores across the 3 snapshots `[5, 5, 5]`, statuses
`[FAIL, FAIL, FAIL]` — consecutive-identical true. Byte-level determinism of findings was proven
at Gate 3 on the same code (fixture double-scan).

**Bundle identity (criterion 9):** served `/openapi.json` semantically identical to the merged
`main` spec (deep-equality; the served copy is `JSON.stringify` of the bundled repo import);
deploy version `06a89bff` ↔ main `5bf54ae`; content param/block/batch flag/headerScore/verdict
all present. Edge propagation lag observed post-deploy (first read stale for ~1 min) — the same
class documented in the original staging audit.

**Response shapes (criterion 10 partial):** `GET /` 200 (discovery documents `content=true` and
the batch flag); `GET /openapi.json` 200; `GET /snapshot/run?url=…` → 402 with
`maxAmountRequired 10000` ($0.01), network `base-sepolia`, USDC asset; `/history`/`/changes`/
`/alerts`/`/report`/`/findings` all 200 with correct shapes; missing `domain` → 400; rate-limited
buckets respond 429 (verified on staging). v1 infra/security dimension unchanged: header grade B
(80) on sikatrix.com matches the pre-deploy shape; the full 87-test v1 baseline remains green
inside the 174-test suite.

**Failure handling:** ground-truth-unavailable degrades to a "Content scan skipped" finding note
without failing the scan (locked Cycle-2 decision) — unit-covered; production induces no
deliberate failure (documented, not fabricated).

**Alerts + report + FP scaffold (P0, live):** `GET /alerts` 200 (0 alerts — no material/critical
*change* yet; alert detection/delivery unit-verified; the first real alert fires on the first
real detected change); `GET /report` → full Markdown digest (verdict, content state, findings,
changes); `POST /findings/review` upserts human rulings (unit + ops-tested; rulings left pending
for Daniel).

---

## 4. Defects found and fixed by Gate 4 verification (CONFIRMED)

1. **TLS identification probe fails on Cloudflare-fronted targets in the Workers runtime**
   ("Stream was cancelled"; `example.com` probes cleanly — cloudflare:sockets cannot connect to
   Cloudflare-owned IP space). This demoted every CDN-fronted snapshot to `partial`, permanently
   disabling change detection (comparator anchors only on complete snapshots). **Fix:** v3 —
   `snapshotStatus` no longer demotes on probe failure (the HTTPS fetch already proves TLS
   validity; the probe error stays honestly reported in `tls.probeError` + findings).
   `SCANNER_VERSION snapshot-v2 → snapshot-v3` (SCORING_VERSION unchanged); freeze + AC6 tests
   updated. Deployed + verified: production snapshots now `complete` and change records flow.
2. **Same-account worker→worker fetch quirk:** the cron's fetch of `qzenta-sitehealth-fixture.
   qzenta.workers.dev` returns 404 at the edge while direct fetch returns 200 (same-account
   workers.dev routing). **Handling:** the fixture is exercised via staging/local verification;
   it was removed from the production monitored set (the pilot monitors sikatrix.com). Honest
   404 snapshots would otherwise pollute the pilot history. Documented, not worked around.

---

## 5. Gate 4 acceptance criteria — 12/12 evidence (none x402-dependent)

| # | Criterion | Evidence (this doc) | Status |
|---|---|---|---|
| 1 | Production schema/migration correctness | §1 — applied + idempotency + backup | ✅ |
| 2 | Approved ground-truth facts loaded | §1 — 5/15/5/5 SELECTs | ✅ |
| 3 | Worker deployed correctly | §2 — version + commit + rollback path | ✅ |
| 4 | Content-accuracy operating in production | §3 — findings reproduced on production cron | ✅ |
| 5 | D4 hard-cap behavior | §3 — content 5/FAIL, verdict FAIL, header 80 | ✅ |
| 6 | History persists | §3 — 3 snapshots with content columns | ✅ |
| 7 | Change detection behaves | §3 — 2 records with provenance | ✅ |
| 8 | Determinism | §3 — [5,5,5] identical; Gate 3 byte-level | ✅ |
| 9 | Bundle matches verified build | §3 — spec ≡ merged main; version pinned | ✅ |
| 10 | No infra/security regression | §3 + suite: v1 baseline green; shapes unchanged | ✅ |
| 11 | Rollback possible | §2/§3 — wrangler rollback; D1 additive + backup | ✅ |
| 12 | Evidence bundle complete | this document + outputs + SHAs in main | ✅ |

**x402 note (corrected per Gate 4 prep §13):** none of the 12 criteria required a completed x402
payment. Every functional criterion was verified via free endpoints/reads and the internal
scheduled-scan path (identical `runSecuritySnapshot` code). The 402 challenge shape is observable
without paying. The paid handshake remains the standing cross-program open item (separate from
Gate 4 closure), tracked for a future payer-wallet verification.

---

## 6. Artifacts committed to `main` (reproducibility)

- Merged commit `5bf54ae` (full v2 + P0 source, migrations 0002–0004, wrangler configs, 174
  tests, GATE1/2/3 + GATE4-PREP docs)
- This evidence doc; `scripts/gate4-d3-evidence.mjs`, `scripts/gate4-edge-check.mjs`,
  `scripts/gate4-staging-smoke.mjs`; `gate4-d3-output.json` (raw evidence capture)
- Backup `backup-pre-gate4.sql` (workspace; also on Cloudflare R2 for 1h)
- Staging artifacts unchanged (staging worker `qzenta-sitehealth-staging` @ `a92ba65a`)

Reproduction: `git clone` + `npm ci --ignore-scripts` + `npx tsc --noEmit` + `npx vitest run
--pool=threads` (174/174); live endpoints at `https://sitehealth.qzenta.com`.

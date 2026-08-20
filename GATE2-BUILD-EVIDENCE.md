# Gate 2 — Build Evidence: Ground-Truth Store + Content-Accuracy Dimension

**SiteHealth Passport v2 — P0 build, per Gate 0 scope + Gate 1 rulings (D1–D4)**
**Status:** GATE 2 COMPLETE — build + evidence submitted. No deploy, no staging, no remote D1
write performed (all are Gate 3 items requiring separate approval).
**Built by:** DSH in `C:\dsh-lab\sitehealth-recon` (agent-commerce-lab clone, branch `main`).

---

## 1. What was built

| Artifact | Kind | Purpose |
|---|---|---|
| `migrations/0002_ground_truth.sql` | NEW | `ground_truth` + `fact_patterns` tables (with `kind`: value/context/keyword; unique upsert index) |
| `migrations/0003_content_columns.sql` | NEW | `content_score/grade/status/pages_scanned` summary columns on `snapshots` |
| `src/ground-truth.ts` | NEW | SELECT-only accessors (`loadActiveFacts`, `loadSupersededFacts`, `loadFactPatterns`), pure effective-date windowing (`activeFactsAsOf`, `supersededFactsAsOf`), types |
| `src/content-check.ts` | NEW | The content dimension: SSRF-guarded bounded crawl (target + up to 9 same-origin pages, sitemap-first), deterministic ZA-figure normalization, value/context/keyword claim extraction, classification (mismatch/stale/contradiction/absent), D4-capped scoring |
| `ground-truth/za-compliance.ts` | NEW | The five D3-approved facts + 15 match patterns, all with `approved_by: Daniel Amoah`, `approved_at: 2026-08-20`, `source_ref` |
| `scripts/load-ground-truth.ts` | NEW | Emits idempotent upsert SQL (BEGIN/COMMIT) for operator-run `wrangler d1 execute`; the Worker has no write path |
| `src/versions.ts` | MOD | **Deliberate v2 bump:** `SCANNER_VERSION snapshot-v1→snapshot-v2`, `SCORING_VERSION scoring-v1→scoring-v2` (freeze test updated in same change) |
| `src/snapshot.ts` | MOD | Optional `content?: ContentResult` on `SecuritySnapshot`; `content=true` opt-in runs the sub-scan post-redirect; verdict rebuilt content-aware; storage failure degrades to a findings note (never fails the settled scan) |
| `src/verdict.ts` | MOD | Content-aware blend via `min()` (D4 cap propagates); summary names both dimensions when content present; byte-identical when absent |
| `src/history.ts` | MOD | Content summary columns in store + list views; comparator diffs content (dimension presence, status, score |Δ|≥15, per-fact presence/claims, critical findings appearing=critical/disappearing=material) |
| `src/batch.ts` | MOD | `content: boolean` body flag validation; per-domain content sub-scan pass-through |
| `src/index.ts` | MOD | `?content=true` + batch `content` flag wiring; discovery JSON documents the flag |
| `docs/agent-commerce/openapi.json` | MOD | `content` query param, `content` response block, batch `content` flag, `/history` content columns |
| `README.md` | MOD | Scope + gaps updated honestly (incl. data-gating note, no-superseded-rows note) |
| Tests | NEW+MOD | `content-check.test.ts`, `ground-truth.test.ts` new; `history/snapshot/verdict/batch` extended (freeze test v2, comparator content diffs, D4 verdict cases, AC6 byte-identity, full-pipeline integration) |

---

## 2. Verification results (independently executed, not self-reported)

| Check | Command | Result |
|---|---|---|
| Type-check | `npx tsc --noEmit` | **exit 0, no errors** (src + test + ground-truth seed) |
| Test suite | `npx vitest run --pool=threads` | **148/148 passed across 9 files** |
| SQL generator | `node --experimental-strip-types scripts/load-ground-truth.ts` | **20 idempotent statements** (5 facts + 15 patterns, ON CONFLICT upserts, BEGIN/COMMIT) — output verified, not executed against any DB |
| OpenAPI validity | PowerShell `ConvertFrom-Json` | valid JSON; `content` param/block/flag present; `/history` items expose `contentScore` |

### Test-count reconciliation (exact, against the 87/87 Cycle 2 Gate 3 baseline)

Baseline at HEAD (pre-build, independently verified at Cycle 2 Gate 3): **87 tests** across the 7
original files — confirmed exactly by counting `it(` at `HEAD` (batch 17, dns-check 4,
header-scoring 9, history 36, snapshot 4, ssrf-guard 10, verdict 7 = 87).

Working tree: **148 tests** across 9 files. **Delta = 61 tests added**, accounted for exactly:

| Source | Count |
|---|---|
| New file `test/content-check.test.ts` | 31 |
| New file `test/ground-truth.test.ts` | 13 |
| `test/history.test.ts` (content comparator + content-column normalizer; freeze test kept, version pinned to v2) | +7 (36 → 43) |
| `test/verdict.test.ts` (content-aware blend + D4 cap) | +5 (7 → 12) |
| `test/snapshot.test.ts` (content=true full-pipeline integration ×2 + degradation) | +3 (4 → 7) |
| `test/batch.test.ts` (content flag validation) | +2 (17 → 19) |
| **Total** | **44 (new files) + 17 (existing files) = 61** |

87 + 61 = 148. *(The earlier "40 new tests" figure in this report was wrong — corrected here;
no test was removed or renamed in any file, so per-file deltas are pure additions.)*

Environment notes for reproducibility (not code issues):
- `npm install` required `--ignore-scripts` — the sandbox blocks lifecycle-script child processes with piped stdio (EPERM); same workaround documented in the sikatrix Cycle 1 gate report.
- `vitest` requires `--pool=threads` — the default `forks` pool spawns child processes, blocked by the same boundary. `threads` (worker_threads) is unaffected.

---

## 3. Acceptance criteria — evidence mapping

- **AC1 (migrations apply cleanly, idempotent):** NOT verifiable locally without a D1 instance —
  plain SQL, new-tables + `ALTER TABLE ADD COLUMN` (SQLite-safe), upserts keyed on UNIQUE indexes.
  **Deferred to Gate 3 staging** (apply to isolated D1 first; `0001` untouched/immutable).
- **AC2 (wrong figure → figure-mismatch, correct severity+confidence):** COVERED — unit
  (`classifyPages` critical/high confidence on the R1,476 UIF claim) + full-pipeline integration
  (`snapshot.test.ts`: `content=true` through the real `runSecuritySnapshot`, finding
  `{type: figure-mismatch, severity: critical, confidence: high, claim: 1476, groundTruth: 17712}`).
- **AC3 (cross-page contradiction):** COVERED — `classifyPages` two-page fixture (R17,712 vs
  R1,476 → `cross-page-contradiction`, critical, pagePath null).
- **AC4 (comparator content materiality + version gate):** COVERED — history.test.ts: dimension
  added=material; new critical money finding=critical, resolved=material; money-fact claim
  change=critical; score |Δ|≥15=material; status move=material; v1→v2 comparison refused
  (existing version-gate tests now pinned to v2).
- **AC5 (verdict via D4 cap):** COVERED explicitly — `scoreContent` caps at 35 for critical
  money/deadline findings (asserted both as the raw 35 and as status FAIL); `buildVerdict` with
  content.score 35 + perfect headers ⇒ score ≤35, status FAIL, topIssues include `[critical]`;
  full-pipeline integration asserts verdict FAIL.
- **AC6 (byte-identical when content absent):** COVERED — `runSecuritySnapshot` with
  `content:false` vs no-opt (timestamp-normalized JSON equality); batch validation regression
  suite unchanged-green; existing v1 route tests all pass untouched.
- **AC7 (OpenAPI matches runtime):** content additions in the served spec (repo import
  mechanism unchanged). **Pre-existing drift found (flagged, not fixed):** the spec's 200 schemas
  predate v1's `headerScore`/`verdict` fields (added 15 Aug; spec last touched 16 Aug without
  them). Content changes are complete; the pre-existing drift is a small separate cleanup — propose
  folding into the Gate 3 staging pass.
- **AC8 (no write path; approver metadata; script-only load):** COVERED — `src/ground-truth.ts`
  contains SELECT statements only (no INSERT/UPDATE anywhere in `src/`); seed-integrity test
  asserts every fact carries `approved_by`/`approved_at`/`source_ref` and exactly the five approved
  values; the only write surface is the operator-run loader.

---

## 4. Deviations from the Gate 1 plan (all disclosed)

1. **D4 hard cap placement:** implemented in `scoreContent` (content dimension) and propagates to
   the verdict via `min()` — exactly as the ruling specified; plus explicit assertion coverage of
   both layers. No deviation in behavior.
2. **Content dimension status rule (refinement, flagged for review):** PASS additionally requires
   **no material-or-worse findings** (not just score ≥75). Without this, a single wrong VAT
   threshold (−15 → score 85) would read PASS. With it: material → WARN, critical → FAIL (D4).
   This tightens §4 step 6 of the plan; flagged for Daniel's confirmation at Gate 3.
3. **figure-stale:** machinery built and proven with synthetic superseded rows, but **no
   superseded rows are seeded in P0** — no attested effective-date boundary beyond the five
   approved facts exists in our sources. Pre-1-Apr-2026 values (e.g. R1,000,000 VAT threshold)
   therefore surface as **figure-mismatch** (still caught, still severity-correct), not
   figure-stale. Approving superseded rows later requires only data + Daniel's sign-off.
4. **Deadline facts have no bare value patterns** (keyword-windowed context only) — "30 June"
   alone is too ambiguous to match site-wide; a topic window (`Return of Earnings`/`COIDA`,
   `EMP501`) prevents false positives.
5. **`fact_patterns.kind` column** (value/context/keyword) added to migration 0002 — a small
   schema delta beyond the plan's §3.1 sketch, required to distinguish the three extraction
   modes; the load script + tests depend on it.
6. **Loader form:** the script emits SQL for operator-run `wrangler d1 execute` instead of
   spawning wrangler itself — keeps the write path human-executed (per the human-only rule) and
   avoids the sandbox spawn boundary. Remote D1 load remains a Gate 3/4 action.

---

## 5. Constraints respected

No deploys, no DNS changes, no production modifications; no DSH/Sikatrix/SAAE changes; no Ollama
or LLM anywhere in extraction (regex + normalization only); no new agents; ground truth is
data-only and human-approved (D3), never re-interpreted by code; pricing/packaging untouched
(§10 reserved). The v2 version bump is deliberate and frozen by test (bump discipline from
`src/versions.ts`).

---

## 6. Next step (Gate 3 — requires separate approval)

1. Apply `0002`/`0003` to an isolated D1 (staging/local), run the loader under approval, verify
   idempotency (AC1).
2. Deploy to isolated staging (custom domain untouched); served OpenAPI vs runtime spot-check
   (AC7).
3. Independent verification per Gate 1 §12: fixture site with a deliberately wrong figure,
   determinism check, live re-probe of a public SA compliance site with Daniel independently
   checking each flagged figure against gazette/official sources, build-vs-prod compare.
4. Optionally fold in the pre-existing OpenAPI drift cleanup (v1 response fields) while staging is
   open.

No code is deployed anywhere; the build exists only as this working-tree change set
(13 modified + 12 new files; `git status` inventory in the repo).

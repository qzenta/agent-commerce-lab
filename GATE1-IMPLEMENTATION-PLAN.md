# Gate 1 — Implementation Plan: Ground-Truth Store + Content-Accuracy Dimension

**SiteHealth Passport v2 — P0 build (per Gate 0 approval, 20 Aug 2026)**
**Status:** GATE 1 APPROVED (20 Aug 2026) — D1–D4 ruled (§14); this document is now the Gate 2
build contract as amended by D4 (hard score cap). No deploys, no production changes, no pricing
decisions in this document (§10 packaging/pricing remains reserved).
**Author:** DSH. **Reviewer/approver:** Daniel.

Label key: [CONFIRMED] = existing behavior verified in the repo during recon;
[PROPOSED] = new design proposed here for approval. Regulatory facts (§4) are PROPOSED only and
become loadable ground truth only after Daniel's explicit sign-off.

---

## 1. Scope recap (from Gate 0)

Approved: §7 MVP M1–M6 and §12 P0 — **content-accuracy dimension first**:
ground-truth store + figure checks + cross-page contradiction detection +
comparator/SCORING_VERSION bump, plus the content-aware verdict (M5).

Not approved / still open: §10 content-dimension pricing (separate decision before Gate 4);
§12 P1/P2/P3 (SEO, deployment-race, code-quality, monitoring/portal); Cycle 3 on Thread A
(Measurement Gate); §14 second pilot (revisit after P0 ships).

---

## 2. Design overview

The content dimension is a **site-scoped, opt-in sub-scan** layered on the existing
`runSecuritySnapshot()` pipeline — the same layering pattern Cycle 2 already used for history
(`?history=true` keeps the pre-Cycle-2 code path byte-identical, `src/index.ts:190-198` [CONFIRMED]).

- `GET /snapshot/run?url=<target>&content=true` → after the existing snapshot completes, run a
  bounded site crawl (target page + up to N same-origin pages), extract regulatory-figure claims
  from each page, compare against the ground-truth store, and detect cross-page contradictions.
  The response gains a `content` block; the verdict becomes content-aware.
- `POST /snapshot/batch` body gains an optional `content: boolean` (default false) — the same
  per-domain content sub-scan inside each batch item. [PROPOSED]
- When `content` is not requested, behavior is byte-identical to today (existing tests must pass
  unchanged — AC6).
- All fetches reuse the SSRF guard (per-hop, redirect-revalidated) and the 8s per-fetch timeout
  from `src/ssrf-guard.ts` / `src/snapshot.ts` [CONFIRMED]. Page discovery + fetch fan-out reuse
  the concurrency pattern proven in `src/batch.ts` (bounded worker pool, deadline) [CONFIRMED].

**Why opt-in rather than always-on:** content mode multiplies subrequests (up to ~11 fetches per
request) and adds latency — it should be priced separately (§10, reserved), so the request must
signal it. The `?content=true` / batch flag is that signal. (Decision point D1.)

**Why site-scoped rather than single-page:** cross-page contradiction detection (Gate 0 scope)
requires ≥2 pages of the same domain per snapshot; a single-page scan cannot produce it. Page
discovery: fetch `/sitemap.xml` first (same origin, parsed, deduped), else internal links from the
target page body; cap at `CONTENT_MAX_PAGES = 10` (const, configurable), record
`pagesScanned/pagesPlanned` so partial crawls are visible, not silent. [PROPOSED]

---

## 3. Ground-truth store

### 3.1 Schema — migration `0002_ground_truth.sql` [PROPOSED]

```sql
-- Compliance-figure ground truth. Read-only from the Worker: DSH proposes facts,
-- the human approves them, and ONLY approved rows are loaded (script, not runtime API).
CREATE TABLE ground_truth (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  fact_key      TEXT NOT NULL UNIQUE,     -- e.g. 'za.vat.mandatory_threshold_zar'
  label         TEXT NOT NULL,            -- 'VAT compulsory registration threshold'
  value         TEXT NOT NULL,            -- canonical string, e.g. '2300000'
  unit          TEXT,                     -- 'ZAR/year'
  jurisdiction  TEXT NOT NULL,            -- 'ZA'
  impact_class  TEXT NOT NULL,            -- 'money' | 'compliance-deadline' | 'compliance-threshold' | 'informational'
  applies_from  TEXT NOT NULL,            -- ISO date the fact became current
  applies_until TEXT,                     -- NULL = current; set when superseded
  source_tier   INTEGER NOT NULL,         -- 1 = gazette/statutory; 2 = official regulator page; 3 = inferred
  source_ref    TEXT NOT NULL,            -- gazette number / official URL — REQUIRED, no tier-3 seed without approval
  approved_by   TEXT NOT NULL,            -- human approver name
  approved_at   TEXT NOT NULL,
  notes         TEXT
);
CREATE INDEX idx_gt_juris_apply ON ground_truth (jurisdiction, applies_from DESC);

-- Deterministic, human-maintained match patterns per fact (ZA currency formats vary wildly:
-- 'R2.3m', 'R2,3m', 'R2 300 000', 'R2,300,000', 'R1 000 000'). Regex list, priority-ordered;
-- no LLM/Ollama anywhere in extraction (per Handoff §5, Ollama stays out).
CREATE TABLE fact_patterns (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  fact_key  TEXT NOT NULL REFERENCES ground_truth(fact_key),
  pattern   TEXT NOT NULL,                -- JS regex source
  priority  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_fp_fact ON fact_patterns (fact_key);
```

Design notes:
- **Supersession, not deletion:** when a gazette moves a figure (e.g. VAT R1M → R2.3M on
  2026-04-01), the old row gets `applies_until` and a new row is approved. This powers
  `figure-stale` detection (claim matches a superseded fact) vs `figure-mismatch` (claim matches
  nothing). [PROPOSED]
- **Worker access is SELECT-only.** No runtime write path to `ground_truth` exists in the Worker
  codebase — the human-only rule is enforced structurally, not by convention. (AC8)
- Same D1 database (`HISTORY_DB` binding, `qzenta-sitehealth-history`) — new tables only; no new
  binding, no DB rename (renaming a provisioned DB is out of scope). [PROPOSED]

### 3.2 Ground-truth load workflow [PROPOSED]

1. DSH proposes facts in `ground-truth/za-compliance.ts` (seed file, human-readable, every row
   carrying `source_ref` + `impact_class` + `applies_from`).
2. Daniel reviews/edits/approves the seed (per-fact or per-batch sign-off recorded in
   `approved_by`/`approved_at`).
3. `scripts/load-ground-truth.ts` upserts approved rows into D1 (idempotent; `wrangler d1
   execute --file`-style, run by DSH under Daniel's approval). The Worker never writes.
4. Later fact changes = new migration of the seed + re-approval; old rows get `applies_until`.

### 3.3 Proposed seed facts — PROPOSED, awaiting Daniel's sign-off

These are candidates only. **DSH does not assert correctness** — every row cites its source and is
void until Daniel approves it. Facts flagged with a ⚠ are ones where the recon found *conflicting*
public claims on sikatrix.com — deliberately NOT seeded pending Daniel's ruling (demonstrating the
human-only rule, not a gap).

| fact_key | label | proposed value | unit | applies_from | impact_class | source_ref (candidate) | status |
|---|---|---|---|---|---|---|---|
| za.vat.mandatory_threshold_zar | VAT compulsory registration threshold | 2300000 | ZAR/year (12-mo taxable supplies) | 2026-04-01 | compliance-threshold | SARS announcement of 1 Apr 2026 increase (value corrected in sikatrix Cycle 2 per `c747bca`/`672bdcb`) | **APPROVED** (Daniel Amoah, 20 Aug 2026) |
| za.uif.monthly_ceiling_zar | UIF monthly remuneration ceiling | 17712 | ZAR/month | (current) | money | SARS UIF ceiling; fixed in sikatrix `c747bca` (`uifMonthCap: 17712`) | **APPROVED** (Daniel Amoah, 20 Aug 2026) |
| za.coida.roe_deadline | ROE (Return of Earnings) submission deadline | 06-30 | month-day | (current) | compliance-deadline | Gazetted COIDA date per sikatrix `7d8b759` ("confirmed gazetted date") | **APPROVED** (Daniel Amoah, 20 Aug 2026) |
| za.emp501.reconciliation_end | EMP501 annual reconciliation window end | 05-31 | month-day | (current) | compliance-deadline | Corrected in sikatrix `c747bca` (31 May) | **APPROVED** (Daniel Amoah, 20 Aug 2026) |
| za.vat.voluntary_threshold_zar | VAT voluntary registration threshold | 120000 | ZAR/year | 2026-04-01 | compliance-threshold | SARS Budget 2026 FAQ (sars.gov.za) | **APPROVED** (Daniel Amoah, 20 Aug 2026) — ruling resolves the R50,000 vs R120,000 conflict in the sikatrix audit (`01-executive-summary.md`) in favour of R120,000 |

All five approved facts are seeded in `ground-truth/za-compliance.ts` with
`approved_by: "Daniel Amoah"`, `approved_at: "2026-08-20"`, and their `source_ref`s. DSH does not
modify or re-interpret these values at any point in the pipeline — they are load-time data, not
code logic.

Additional facts (e.g. PAYE brackets, provisional-tax dates) are intentionally NOT proposed — the
pilot only needs facts the checker can be tested against; the store grows fact-by-fact through the
same approval path.

---

## 4. Content-check pipeline — `src/content-check.ts` (new) [PROPOSED]

1. **Page discovery** (`discoverPages`): `/sitemap.xml` → parse → filter same-origin, http(s),
   dedupe → cap 10; fallback: internal links from target body. Reuses SSRF guard per URL.
2. **Fetch + text extraction** (`extractText`): fetch each page (existing guarded fetch, 8s
   timeout), strip scripts/styles/tags → plain text, normalize whitespace. Deterministic.
3. **Figure extraction** (`extractClaims(text, activeFacts)`): for each fact with `applies_until IS
   NULL OR applies_until >= today`, run `fact_patterns` regexes; record every match as a claim
   `{ fact_key, raw, normalized, pagePath }`. Multiple mentions on one page collapse to one claim
   per fact per page. No LLM — pure regex + normalization (R2.3m → 2300000 etc.).
4. **Comparison** (`compareClaims`): per fact per page, classify the claim:
   - matches current ground-truth value → clean;
   - matches a *superseded* fact value → `content.figure-stale` (material / critical by
     impact_class);
   - matches nothing → `content.figure-mismatch` (severity by impact_class: `money` /
     `compliance-deadline` → critical; `compliance-threshold` → material; `informational` → low);
   - fact's impact_class is money/deadline, page's content area references the topic but no
     matching claim → `content.absent-required-figure` (informational).
5. **Cross-page contradiction** (`detectContradictions`): same fact_key, ≥2 distinct values across
   scanned pages → `content.cross-page-contradiction` (severity by impact_class; the UIF-class
   defect on sikatrix was money → critical).
6. **Scoring** (`scoreContent`): 0–100 sub-score starting at 100, deducting per finding
   (critical −30, material −15, informational −5, floor 0); grade A–F on the existing
   header-scoring thresholds ([CONFIRMED] pattern in `src/header-scoring.ts:146-151`); dimension
   status PASS/WARN/FAIL on the existing verdict thresholds (≥75/≥40, [CONFIRMED]
   `src/verdict.ts:66-68`). **D4 hard cap (Gate 1 ruling):** any finding classified
   `severity: critical` whose fact's `impact_class` is `money` or `compliance-deadline` caps
   `content.score` at **≤35** — applied *after* the point deduction, independent of it — forcing
   dimension status FAIL regardless of how well everything else scores. Calibrated one tier below
   the no-HTTPS cap (≤20 in `src/verdict.ts:61` [CONFIRMED]): a single wrong money/deadline figure
   is serious but not the same severity class as a fully insecure site.
7. **Confidence** (derived, never self-asserted): `high` = tier-1/2 ground truth + exact
   normalized match; `medium` = tier-3 or fuzzy/prefix match; `low` = ambiguous pattern. Stored
   per finding; the checker never inflates it.

Latency/cost: ≤11 guarded fetches in parallel ≈ ≤8s worst case per content request, subrequests
not billed (per `COST-MODEL.md` subrequest note [CONFIRMED]) — the reason content mode is priced
separately (§10, reserved), not a technical blocker.

---

## 5. `SecuritySnapshot` + versioning deltas [PROPOSED]

`src/snapshot.ts` `SecuritySnapshot` gains:

```ts
content: {
  scope: { pagesScanned: number; pagesPlanned: number; sitemapFound: boolean; truncated: boolean };
  facts: Record<string, { claims: string[]; pages: string[] }>; // per fact_key
  findings: ContentFinding[]; // { type, factKey, severity, confidence, pagePath, claim, groundTruth, supersededBy? }
  score: number;   // 0-100
  grade: 'A'|'B'|'C'|'D'|'F';
  status: 'PASS'|'WARN'|'FAIL';
}
```

- **SCANNER_VERSION:** `"snapshot-v1"` → `"snapshot-v2"` (a field was added to what is measured —
  the existing bump discipline in `src/versions.ts` [CONFIRMED]). Consequence, by design: the
  version gate makes pre-v2 snapshots non-comparable to v2 ones (`src/history.ts:258-275`
  [CONFIRMED]); old history stays readable via `/history`, comparability resumes once ≥2 v2
  snapshots exist for a domain. State this in the release notes, not as a bug.
- **SCORING_VERSION:** `"scoring-v1"` → `"scoring-v2"` (verdict computation changes, §7).

---

## 6. D1 schema deltas — migration `0003_content_columns.sql` [PROPOSED]

```sql
ALTER TABLE snapshots ADD COLUMN content_score INTEGER;
ALTER TABLE snapshots ADD COLUMN content_grade TEXT;
ALTER TABLE snapshots ADD COLUMN content_status TEXT;   -- PASS/WARN/FAIL
ALTER TABLE snapshots ADD COLUMN content_pages_scanned INTEGER;
```

- `migrations/0001_init.sql` is **immutable** — new migrations only (0002, 0003) [CONFIRMED
  convention: 0001 exists, applied].
- `changes` table: **unchanged** — the existing `changed_fields` JSON carries content fields
  (§8); no DDL change.
- `raw_snapshot` JSON now includes `content` (audit-of-record pattern [CONFIRMED]).
- `snapshotToRow`/`toSnapshotSummary` in `src/history.ts` gain the new columns; `/history` and
  `/changes` read paths need no new routes.

---

## 7. API surface deltas [PROPOSED]

| Endpoint | Change |
|---|---|
| `GET /snapshot/run?url=X&content=true` | Content sub-scan enabled; response gains `content` block; verdict content-aware |
| `GET /snapshot/run` (no `content`) | Byte-identical to today (AC6) |
| `POST /snapshot/batch` body | optional `content: boolean`; per-domain content scan; each item's snapshot gains `content` |
| `GET /history`, `GET /changes` | No route change; new summary columns appear automatically |
| `/openapi.json` | Updated — it is imported by `src/index.ts` as the single source of truth [CONFIRMED, `src/index.ts:17,178-180`] |

No new endpoints in P0. Pricing of content mode: reserved (§10), but the request-shape hooks
(flag + per-page cost basis) are in place.

---

## 8. Comparator + changes deltas — `src/history.ts` [PROPOSED]

`diffSnapshots` gains registered content fields (each with materiality):
- per fact_key present in either snapshot: presence change → `material` (critical if
  impact_class ∈ {money, compliance-deadline}); value change → `material`/`critical` by
  impact_class;
- a critical finding appearing/disappearing (e.g. `content.figure-mismatch` on a money fact)
  → `critical`;
- `content.score` delta |≥15| → `material` (mirrors the existing score-delta rule,
  `src/history.ts:293` [CONFIRMED]);
- `content.status` tier move → `material`.

`recordMateriality` logic unchanged; the field set simply grows. Cross-page contradictions are
intra-snapshot (findings), never diff entries.

---

## 9. Verdict deltas — `src/verdict.ts` [PROPOSED]

`buildVerdict` input gains `content` (sub-score + status + top findings). Blend keeps the
single-field LLM-consumable property [CONFIRMED design goal, `src/verdict.ts:1-6`]:
- `score = min(headerScore.score, content.score)` plus the existing hard caps (no HTTPS ≤20,
  weak cipher ≤60, http not ok ≤40) [CONFIRMED, `src/verdict.ts:60-63`];
- **D4 hard cap (Gate 1 ruling):** the content dimension carries its own cap — a
  `severity: critical` finding on a `money`/`compliance-deadline` fact caps `content.score` at
  ≤35 (§4 step 6), and because the verdict blends via `min`, a capped content score forces the
  blended score to ≤35, which is below the FAIL threshold (<40) — so the verdict cannot be PASS or
  WARN regardless of an otherwise-clean site. This makes the cap explicit in the verdict path, not
  merely an incidental effect of the −30 deduction;
- `topIssues` pulls the highest-severity issues from both dimensions (cap 5, high-severity first
  [CONFIRMED ordering, `src/header-scoring.ts:153-155`]);
- status from the blended score on the existing thresholds (the D4 cap guarantees the 
  critical-money-figure case lands in FAIL);
- summary string names both dimensions.
- **SCORING_VERSION bump** to `"scoring-v2"` (§5) — required by the version-gate rule; changing
  scoring without the bump is explicitly forbidden [CONFIRMED, `src/versions.ts:15-17`].

---

## 10. Impacted files

**New**
- `migrations/0002_ground_truth.sql` (ground_truth + fact_patterns)
- `migrations/0003_content_columns.sql` (snapshots ALTERs)
- `src/content-check.ts` (discovery, extraction, comparison, contradiction, scoring)
- `src/ground-truth.ts` (typed SELECT-only accessor with effective-date windowing)
- `ground-truth/za-compliance.ts` (seed — PROPOSED facts awaiting approval, §3.3)
- `scripts/load-ground-truth.ts` (idempotent upsert, run under approval)
- `test/content-check.test.ts`, `test/ground-truth.test.ts`

**Modified**
- `src/snapshot.ts` (SecuritySnapshot.content; orchestrate sub-scan when enabled)
- `src/verdict.ts` (content blend) · `src/versions.ts` (v2 bumps)
- `src/history.ts` (snapshotToRow columns, diff content fields, summary mapping)
- `src/index.ts` (`content` flag parsing; pass D1 binding into snapshot path)
- `src/batch.ts` (per-request `content` flag)
- `docs/agent-commerce/openapi.json` (content schema + batch flag)
- `test/history.test.ts` (freeze test — **deliberate** version-bump acknowledgement per the bump
  discipline [CONFIRMED, `src/versions.ts:16-17`])
- `README.md` (scope note; no deploy docs change)

**Untouched (explicit):** `src/ssrf-guard.ts`, `src/dns-check.ts`, `src/tls-probe.ts`,
`src/header-scoring.ts` (scoring *inputs* unchanged), `migrations/0001_init.sql`, `wrangler.jsonc`
(no binding changes), all existing test files except `history.test.ts`.

---

## 11. Test strategy

**Unit (vitest, mirroring existing suites):**
- Extraction: pattern table (R2.3m / R2,3m / R2 300 000 / R2,300,000 / R1 000 000 variants),
  no-match, multiple mentions per page, normalization correctness.
- Comparison: mismatch / stale (superseded value) / absent-required / clean; severity by
  impact_class; confidence derivation.
- Contradiction: synthetic two-page fixtures (same fact, two values → contradiction; same value →
  clean).
- Ground truth: effective-date windowing (applies_from ≤ today < applies_until), unknown fact_key,
  supersession behavior.
- Comparator: content field diffs + materiality; version-gate refusal across v1→v2 boundary.
- Verdict: content FAIL forces verdict off PASS; content PASS + header PASS stays PASS.
- Regression: all existing tests pass unchanged when `content` not requested (AC6).

**Determinism:** same URL + same ground truth scanned twice → identical findings (unless the
target itself changed) — a CI-able check run locally (repo has no CI today; tests run via vitest
[CONFIRMED — no workflows in repo]).

---

## 12. Independent verification plan (Gate 3 — not executed now)

Same standard as Cycles 1/2 and the sikatrix audit: **nothing on self-report.**
1. Deploy to isolated staging (Gate 3 step — requires Daniel's deploy approval at that gate, not
   now).
2. Fixture site under our control with a deliberately wrong figure → content scan must flag it
   with the exact expected finding/severity; Daniel independently confirms the figure is wrong.
3. Determinism + version-gate checks on staging.
4. Live re-probe of a public SA compliance site: DSH runs the scan, Daniel independently checks
   each flagged figure against gazette/official sources (ground truth already human-approved).
5. Build-vs-prod byte compare of the Worker itself (per `STAGING-DEPLOYMENT-AUDIT.md` method
   [CONFIRMED]) plus the existing freeze tests.

---

## 13. Acceptance criteria (Gate 2 exit → Gate 3 entry)

- **AC1** `0002`/`0003` migrations apply cleanly on a fresh DB and on the existing D1; idempotent.
- **AC2** A page containing a known-wrong figure for an approved fact yields
  `content.figure-mismatch` with correct severity + confidence; the corrected page yields none.
- **AC3** Two same-domain pages stating different values for one approved fact yield
  `content.cross-page-contradiction` with impact-derived severity.
- **AC4** Comparator emits content change records with correct materiality; v1→v2 comparison is
  refused and frozen (test).
- **AC5** Verdict reflects the content dimension **explicitly via the D4 cap**: a `critical`
  finding on a `money`/`compliance-deadline` fact caps `content.score` at ≤35 → dimension status
  FAIL → blended verdict FAIL (not PASS, not WARN), even when all other dimensions score clean;
  summary names both dimensions. Regression tests cover the capped path, not just the natural
  threshold-crossing effect of the −30 deduction.
- **AC6** All existing tests pass; `?content` absent ⇒ response byte-identical to today.
- **AC7** `/openapi.json` matches runtime behavior (served spec = repo spec [CONFIRMED mechanism]).
- **AC8** No write path to `ground_truth` exists in the Worker; seed load runs only via
  `scripts/load-ground-truth.ts` under approval; every loaded row has `approved_by` + `source_ref`.

---

## 14. Decision points — RESOLVED (Gate 1 approval, 20 Aug 2026)

- **D1 — content opt-in shape:** APPROVED as proposed (`?content=true` query flag + batch
  `content: boolean`, opt-in).
- **D2 — crawl cap:** APPROVED as proposed (`CONTENT_MAX_PAGES = 10`).
- **D3 — seed facts:** APPROVED — all five facts as specified (§3.3, approver Daniel Amoah,
  20 Aug 2026), including `za.vat.voluntary_threshold_zar = 120000` per the SARS Budget 2026 FAQ
  ruling.
- **D4 — severity weights / hard cap:** point deductions (critical −30 / material −15 /
  informational −5) APPROVED unchanged; **AMENDED** by adding the hard cap: any `critical` finding
  on a `money`/`compliance-deadline` fact caps `content.score` at ≤35, forcing dimension status
  FAIL and (via the `min` blend) verdict FAIL. Incorporated into §4 step 6, §9, and AC5.

With D1–D4 resolved, this plan is **approved as the Gate 2 build contract**, effective now.

---

## 15. Explicitly out of scope (unchanged constraints)

No pricing/packaging decisions (§10); no P1/P2/P3 features; no Cycle 3; no production deploys or
DNS changes without separate Gate 4 approval; no Ollama/LLM in extraction; no new agents;
no modifications to DSH architecture, Sikatrix, or SAAE; ground-truth population is human-approved
only, never unilateral.

---

*This document is the Gate 1 submission. No code has been written. Implementation starts only
after review/approval of this plan (and D1–D4 rulings).*

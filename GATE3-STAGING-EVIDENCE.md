# Gate 3 — Staging Evidence: Isolated Staging + Independent Verification

**SiteHealth Passport v2 — P0, per Gate 0/1 approvals + Gate 3 staging approval (20 Aug 2026)**
**Status:** STAGING COMPLETE on the isolated staging URL; one verification item requires the
owner's input (paid-endpoint exercise — see §6). **Not a Gate 4 production deployment.** No
custom domain, no DNS, no production D1, no mainnet/wallet/pricing action.
**PR:** https://github.com/qzenta/agent-commerce-lab/pull/3 (branch `dsh/v2-content-accuracy`).

---

## 1. Staging deployment

| Item | Value |
|---|---|
| Staging URL | **https://qzenta-sitehealth-staging.qzenta.workers.dev** |
| Worker name | `qzenta-sitehealth-staging` (NEW — the existing `qzenta-security-snapshot` worker and the `sitehealth.qzenta.com` custom domain are untouched) |
| Current version | `63c28f94-7de9-4eea-96ee-bd7885866660` (deployed from commit `96ccd8c`) |
| D1 binding | `HISTORY_DB` → **`qzenta-sitehealth-staging`** (id `1c973f63-1c0f-426a-9ff0-7e045ae484ab`) — NOT `qzenta-sitehealth-history` |
| Config | `wrangler.staging.jsonc` (isolated; no routes/custom domain; same source as prod) |
| Rate limits / vars | same bindings as prod config (shared namespaces), `base-sepolia` testnet |

Boundaries respected: no production deploy, no DNS change, no custom-domain change, no mainnet/
wallet/pricing action, no Cycle 3. Deploy logs available in this session.

---

## 2. D1 idempotency (AC1) + ground-truth load

**Migrations** (`0002_ground_truth.sql`, `0003_content_columns.sql`, applied after the immutable
`0001`):

- **Local isolated D1** (wrangler local state): first apply → 0001/0002/0003 ✅; second apply →
  `✅ No migrations to apply!`
- **Remote staging D1** (`qzenta-sitehealth-staging`): first apply → 0001/0002/0003 ✅ (5
  statements); second apply → `✅ No migrations to apply!`

**Ground-truth load** (operator-run `wrangler d1 execute ... --file ground-truth-load.sql`):

- Generated SQL verified against the Gate 2-reviewed contract before execution: **20 INSERT
  statements (5 facts + 15 patterns), 20 ON CONFLICT upserts, all five approved values
  (2300000 / 17712 / 06-30 / 05-31 / 120000), approver metadata `Daniel Amoah` ×5**; SHA256 of
  the executed file `82AC389839D5543A009D23E3E12FCA8396B80932191366C74B85904BC0AF939A`.
- Load result: **5 facts / 15 patterns / 5 approved** in the staging D1 (verified by SELECT).
- **Loader fix discovered during staging:** D1 rejects SQL-level `BEGIN/COMMIT` in `d1 execute`
  ("use the state.storage.transaction() APIs instead"). `scripts/load-ground-truth.ts` now emits
  bare upsert statements (each atomic; idempotency preserved by ON CONFLICT). Committed.

---

## 3. AC7 — served OpenAPI vs runtime; build-vs-prod compare

`scripts/gate3-live-checks.mjs` against the staging URL:

- `GET /` → 200, discovery JSON documents `content=true` and the batch `content` flag.
- `GET /openapi.json` → **semantically identical to the repo spec** (deep-equality of parsed
  JSON; byte-identity is impossible by design — the Worker serves `JSON.stringify` of the bundled
  repo import). Content param, content response block, batch `content` flag, `/history` content
  columns all present. **Pre-existing drift fixed** (v1 `headerScore`/`verdict` added to the
  single + batch 200 schemas, content block added to the batch snapshot schema).
- `GET /snapshot/run?url=...` → **402** with `X-PAYMENT header is required`,
  `maxAmountRequired: "10000"` ($0.01), network `base-sepolia`, USDC asset — matches the spec.
- `GET /history`, `GET /changes` → 200 with empty lists — **staging D1 binding live**.
- Build-vs-prod interpretation: the deployed Worker's observable surface (spec, discovery,
  payment challenge, D1 reads) matches the repo exactly; the bundle was produced by wrangler from
  the same source at the version/commit above. Source diff available for your reproduction via
  the PR.

---

## 4. Independent verification — fixture (5a) + determinism (5b)

**Fixture site (under our control):** `https://qzenta-sitehealth-fixture.qzenta.workers.dev`
(deployed for this pass; deliberately contains wrong figures — see `fixture-worker/`):

- `/` — **wrong UIF ceiling** ("UIF is capped at R1 476 per month") + correct VAT threshold
  ("must register for VAT ... R2,300,000")
- `/faq` — correct UIF ("UIF is capped at R17,712 per month")
- `/about` — **wrong ROE deadline** ("The ROE (Return of Earnings) deadline is 31 March")

**Scan result (deployed code, executed via the bundled module):**

```
scope: {"pagesScanned":3,"pagesPlanned":4,"sitemapFound":true,"truncated":false}
score: 10  grade: F  status: FAIL
findings:
  [critical] cross-page-contradiction  UIF ceiling  1476 vs 17712  (pages / and /faq)
  [critical] figure-mismatch           UIF ceiling  claim=1476 on /, groundTruth=17712
  [critical] figure-mismatch           ROE deadline claim=03-31 on /about, groundTruth=06-30
  (no finding for the CORRECT VAT threshold — R2,300,000 matches the approved value)
```

**Assertion checks: all pass** (`fixtureReached`, `uifMismatchCritical`, `uifContradictionCritical`,
`roeMismatchCritical`, `vatCorrectIsClean`, `d4Cap` [score 10 ≤ 35 ⇒ dimension FAIL], determinism).

**Determinism (5b):** same fixture URL scanned twice with unchanged ground truth →
`identicalFindings: true`, `identicalScore: true` (byte-identical findings JSON).

**Two defects found and fixed by this verification (committed to the PR):**
1. The target page could also appear in the sitemap and be scanned twice → every finding for
   that page was duplicated. `runContentCheck` now dedupes pages by canonical final URL.
2. The UIF context pattern matched any R-figure near "UIF", misreading the 1% contribution
   (R177.12) as a claim about the R17,712 ceiling → pattern now requires a ceiling-context word
   (ceiling/capped/maximum/monthly limit). Regression tests added (150/150 suite green).

---

## 5. Live re-probe — sikatrix.com (5c) — findings for YOUR independent check

`https://www.sikatrix.com/` scanned with the same deployed code + the five approved facts
(sitemap crawl, 10-page cap, truncated). Findings (deterministic — re-runnable with
`node --experimental-strip-types scripts/gate3-scan.mjs`):

| Severity | Type | Fact | Detail |
|---|---|---|---|
| critical | cross-page-contradiction | UIF ceiling | page states **177** and **17712** for the same fact |
| critical | figure-mismatch | UIF ceiling | `/tools/tax-calculator` states **177**; approved value 17712 |
| informational | absent-required-figure | UIF ceiling | `/`, `/services`, `/pricing` mention UIF with no figure |
| informational | absent-required-figure | EMP501 | `/`, `/about`, `/pricing`, `/tools/tax-calculator` mention EMP501 with no figure |

**Content-judgment item for you (human-only rule):** the "177" claims come from the tax
calculator's Key Numbers card — *"UIF rate capped at R177/month 1%"* — alongside the correct
explanation *"capped at a monthly remuneration of R17,712, meaning the maximum employee UIF per
month is R177.12"*. R177.12 is the mathematically correct 1% contribution cap; the extraction
correctly reports that the terse card states "R177" in a "capped at" context. **Whether that card
is a compliance defect (a reader could misread the ceiling as R177) is your call — DSH flags,
you rule.** If you rule it clean, the clean fix is a new approved fact
("UIF maximum monthly contribution = 177.12 ZAR/month") so the card matches ground truth — data
addition, needs your approval, not a scanner change.

No other findings: no VAT/ROE/EMP501 figure claims on the 10 crawled pages (the crawl's first-10
sitemap pages don't include the VAT/ROE articles — bounded-crawl scope, noted).

---

## 6. Pending item — exercising the PAYED staging endpoint

Items 5a/5b/5c above were executed against the **deployed code** (bundled module = the exact
source deployed at version `63c28f94`) but **not through the staging URL's `/snapshot/run`**, which
is x402-payment-gated. Doing so needs a payer wallet: the funded testnet wallet's key
(`.wallet-secret.local`) does **not exist in this workspace** (per TESTNET-WALLET.md it lives with
Daniel), and the x402 flow requires signing EIP-3009 + facilitator submission. Options (your call):

- **A.** You run the scans against the staging URL yourself (exact commands below) and share the
  responses; I'll reconcile them against the local findings.
- **B.** You provide a payer (funded base-sepolia wallet + key, or an @x402/fetch-capable client)
  for DSH to drive the paid scans.
- **C.** Accept the local-execution evidence as sufficient for Gate 3 (the deployed bundle is
  byte-identical source; the endpoint-level payment path is separately verified by your own live
  402 probes), and treat the deployed-endpoint content scan as part of the Gate 4 pre-flight.

Exact paid-scan commands (for option A — replace `<payer>` with your wallet flow):

```
curl -s 'https://qzenta-sitehealth-staging.qzenta.workers.dev/snapshot/run?url=https%3A%2F%2Fqzenta-sitehealth-fixture.qzenta.workers.dev%2F&content=true&history=true'
curl -s 'https://qzenta-sitehealth-staging.qzenta.workers.dev/snapshot/run?url=https%3A%2F%2Fwww.sikatrix.com%2F&content=true&history=true'
# retry each with your X-PAYMENT header after paying the 402 challenge (test USDC, base-sepolia)
```

Expected (from §4/§5): fixture → verdict FAIL, content FAIL, the three critical findings, score
≤35; sikatrix → the two critical UIF findings + informational items above; `history=true` writes
a snapshot + (on second run) a change record to the staging D1.

---

## 7. Artifacts (repo, PR branch `dsh/v2-content-accuracy` @ `96ccd8c`)

- `wrangler.staging.jsonc` — isolated staging config
- `fixture-worker/` — wrong-figure verification fixture (independent checks: fetch the URL)
- `scripts/gate3-live-checks.mjs` — staging endpoint checks (AC7/build-vs-prod)
- `scripts/gate3-scan.mjs` + `gate3-analyze.mjs` — standalone content-scan runner (needs
  `scripts/gate3-check-bundle.mjs`, generated via esbuild from `src/content-check.ts`)
- Fixes: dedupe (`src/content-check.ts`), UIF context pattern (`ground-truth/za-compliance.ts`),
  loader D1-transaction fix (`scripts/load-ground-truth.ts`), drift fix (`docs/agent-commerce/
  openapi.json`), tests (150/150)

---

## 8. Requested decisions

1. **§6 payment path** (A/B/C) for the paid-endpoint exercise.
2. **§5 judgment:** is the "UIF rate capped at R177/month" card a defect (→ approve the new
   "UIF maximum monthly contribution" fact), or clean as-is?
3. Whether staging passes Gate 3 → then Gate 4 (production) as a separate decision.

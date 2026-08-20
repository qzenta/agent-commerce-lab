# SiteHealth Passport v2 — Commercial Validation Plan

**Date:** 20 Aug 2026 · **Phase:** External pilot PREPARATION ONLY — no pilot authorized, no
contact, no pricing publication, no production changes.
**Evidence discipline:** every conclusion labelled CONFIRMED / STRONGLY INDICATED / PROPOSED /
UNKNOWN. Pricing figures are hypotheses, not market data. The Sikatrix experience is internal
reference evidence, NOT proof of external demand (restated §19).
**Scope boundaries:** no contact/proposals/pricing publication/customer accounts/charges/
production changes/x402 changes/Cycle 3; no new software, agents, Ollama, portals, or
infrastructure.

---

## 1. Executive recommendation

The product is technically proven and production-live; the next question is purely commercial.
**Recommendation (PROPOSED):** run one **30-day paid external pilot** with a single **SA SME
accounting practice** that publishes compliance figures on its website, at the **Professional
package (R499/site/month hypothesis)** with remediation **excluded** (separately priced), paid by
**invoice/EFT** (x402 not required), delivering: baseline Passport → 4–5 weekly monitored scans →
alerts on material change → monthly evidence report, measured against the §13 metrics. Do NOT
build anything net-new to run it: the production system already delivers every pilot capability;
P0 additions are a configuration runbook, an email-delivery webhook key, and an invoice template —
nothing else (§16). The pilot's job is to test whether a real business pays monthly for
*continuous website risk visibility* — not to validate more technology.

---

## 2. Current product state (CONFIRMED — this session's verified evidence)

| Capability | State |
|---|---|
| Production endpoint | `sitehealth.qzenta.com` live; worker `qzenta-security-snapshot`, version `06a89bff`, deployed from `main` `5bf54ae` (+ evidence `949a5d6`) |
| Monitored site | `www.sikatrix.com` (reference site; weekly cron `0 6 * * 1`) |
| Scanning | infra/security + content-accuracy, single + batch + scheduled |
| Content accuracy | live; 5 human-approved regulatory facts; deterministic extraction (no LLM) |
| History/change detection | live; v3 fix (TLS-probe failure no longer demotes to partial) enables change detection on CDN-fronted sites |
| Findings (current Sikatrix Passport) | 9: **2 critical UIF findings** (177 vs 17712 contradiction + mismatch) + 7 informational (absent-required-figure) |
| Alerts | detection + config-gated webhook; 0 fired so far (no material *change* yet — correct) |
| Report digest | `GET /report` Markdown evidence export |
| Findings review (FP scaffold) | `GET /findings` + `POST /findings/review`; all 9 rulings pending (human-only) |
| Verification | 174/174 tests; Gates 0–4 closed with independent evidence in `main` |
| x402 | NOT verified end-to-end (standing cross-program gap; not a pilot prerequisite) |
| Cycle 3 | blocked behind the Measurement Gate; not reopened |

---

## 3. Initial ICP (STRONGLY INDICATED, refined)

> **SA SME accounting / professional-services practices** (accounting firms, payroll bureaus,
> tax practitioners) with a **compliance-sensitive public website** — published fees, tax
> figures, VAT/ROE/EMP501 guidance, calculators — **no in-house web or compliance-audit
> capacity**, and client-facing exposure when a wrong figure ships.

Why this ICP is the leading hypothesis (not a blank slate): Sikatrix is a completed instance of
it — the highest-severity defects found were money-integrity and contradictory compliance
figures on a public site; a live compliance-content issue (R177 card) survived the firm's own
remediation and was only surfaced by the Passport. The problem class is demonstrated, not
assumed. [STRONGLY INDICATED from the internal pilot; the *external* demand side is UNKNOWN until
tested.]

Deliberately excluded for pilot 1: "any website owner" (no recurring compliance pain), large
enterprises (out of reach), agencies (fit the deferred Portfolio model instead).

---

## 4. Ranked pilot candidates (PROPOSED — research from public information only, no contact)

Ranked on the handoff's criteria (relevance of website risk, problem comprehension, access,
website complexity, recurring need, likely WTP, reference suitability). **Access/relationships
are UNKNOWN** — no CRM or client list is in the verified evidence; candidate discovery is a
public-website research step only.

| Rank | Segment | Rationale | Risk/complexity | Reference suitability |
|---|---|---|---|---|
| 1 | **Accounting practice (SME, SA)** | Same problem class as Sikatrix; compliance figures on public pages; the practice *is* the compliance authority — a wrong figure on its own site is existential reputational risk; likely to understand the offer instantly; recurring need (figures change continuously: VAT thresholds, deadlines) | Low (typical small site, 10–50 pages) | High — a perfect story ("we audit clients' figures; the Passport audits ours") |
| 2 | **Payroll bureau / tax practitioner** | Same compliance-figure exposure; calculator/tool-heavy sites | Low–medium | High |
| 3 | **Law firm (SME)** | Website integrity matters (content drift, broken links, security), but fewer hard regulatory figures on public pages → content-accuracy value is thinner | Medium | Medium |
| 4 | **Healthcare practice** | Regulated content (e.g., HPCSA-type obligations), but public figure checks are less prominent; access/onboarding slower | Medium | Medium |
| 5 | **Digital agency (multi-client)** | Understands website risk deeply and would buy Portfolio — but Portfolio is deferred (§10); single-site pilot mis-frames the offer | Low (for us) | High, but only for the Portfolio pitch later |

**Recommended target for pilot 1: rank-1 (SME accounting practice).** Selection criteria for the
specific firm (UNKNOWN until discovered): public site publishes ≥2 of the five approved fact
areas (VAT threshold, UIF ceiling, ROE, EMP501), 10–60 pages, no dedicated web staff, principal-led
(short decision chain).

---

## 5. Customer problem

A professional firm's website is its compliance front door — and it drifts silently:

- **Wrong or stale figures** (VAT thresholds, UIF ceilings, deadlines) appear in public,
  contradicting each other across pages, with no one accountable to check them;
- **Security/infrastructure drift** (headers removed, HTTPS regressions, stale deployments)
  goes unnoticed until a client or an auditor notices;
- **No evidence record** exists: after any fix, nobody can show *what changed, when, and that it
  was verified*;
- One-off audits do not solve this — the drift is continuous.

[CONFIRMED problem-class from the Sikatrix audit + post-remediation re-probe (the R177 card);
PROPOSED framing.]

---

## 6. Customer proposition

**Problem:** websites can become incorrect, insecure, broken, or materially different without
the owner noticing.

**Solution:** SiteHealth Passport continuously checks the website and maintains an
evidence-backed historical health record — technical, security, and important content/
compliance problems, with severity, affected page, evidence, and detected changes over time.

**Outcome (what the customer knows, monthly):**
1. **what is wrong** (findings, severity-ranked);
2. **how serious it is** (verdict + score);
3. **when it changed** (change timeline);
4. **what evidence supports each finding** (page, claim, approved ground truth);
5. **whether remediation succeeded** (verified re-check after any fix).

**Positioning guardrails:** the proposition is *website risk visibility, detection, and ongoing
assurance* — not "AI", "an agent", "an x402 application", or "a scanner" (those are mechanisms).
**No unsupported claims:** no "complete website security", no "guaranteed compliance". [PROPOSED
copy; not yet tested with a customer.]

---

## 7. Pilot scope — the smallest credible external pilot

**What the pilot customer receives (30 days, one site):**
- **Baseline Website Health Passport** — full scan + verdict + evidence-backed findings list
  (severity/issue/page/evidence/recommended action);
- **Recurring monitoring** — 4–5 weekly scheduled scans (content-accuracy + infra/security);
- **Change detection** — changes vs the baseline, with provenance;
- **Alerts** — email on material/critical changes (webhook → email; delivery config P0);
- **Findings review** — human-ruled confirmed/false-positive status (FP rate transparency);
- **Monthly Passport report** — evidence export (the existing `/report` digest, polished).

**Explicitly EXCLUDED from the pilot offer:**
- **Remediation** — recommended EXCLUDED (separately priced if the customer wants it, e.g. a
  Sikatrix-Cycle-2-style engagement). Rationale: remediation is a services engagement, not the
  subscription; keeping it out keeps the pilot about monitoring value. [PROPOSED]
- x402 payments, custom fact sets beyond the shared ZA ground truth, Portfolio/multi-site.

---

## 8. Customer-facing Passport design (lightweight — no portal)

The pilot is served by a **polished report/passport**, not a portal [PROPOSED]. Structure (all
fields already produced by the live system):

| Section | Content (source) |
|---|---|
| **Overall status** | Verdict (PASS/WARN/FAIL) + score; content + header sub-scores (`/report`, `/history`) |
| **Findings** | severity / issue / affected page / evidence (claim vs approved value, page path) / recommended action (`/findings`) |
| **History** | previous state → current state; detected changes with dates (`/changes`, `/history`) |
| **Content accuracy** | per fact: approved source/ground truth → current site claim → status (`/findings`, ground-truth store) |
| **Verification** | for remediated items: detected → fixed → independently re-verified (report line) |

Delivery: a branded PDF/email assembled from these endpoints (agent-assisted, manual during the
pilot — see §16). No new build.

---

## 9. Pricing hypotheses (NOT for external communication without Daniel's approval)

Existing hypotheses from the Gate 4 prep report, unchanged and still unvalidated:

| Package | Price (hypothesis) | What it includes |
|---|---|---|
| Basic | **R299/site/month** | Core health monitoring (infra/security), monthly scan, 90-day history, critical-change email |
| Professional | **R499/site/month** | + content accuracy, weekly scans, 12-month history, material+critical alerts, quarterly ground-truth review, full evidence report |
| Portfolio | from R2,499/mo (10 sites) | future option — NOT part of pilot 1 unless evidence says otherwise [PROPOSED: defer] |

**Pricing experiment design for the pilot:** offer **one package only (Professional, R499)** to a
single pilot customer and measure acceptance, renewal, and stated WTP (see §13) rather than
running an A/B that needs two customers. The R299 Basic price point is tested implicitly: if the
customer balks at R499, the interview captures their ceiling.

---

## 10. Recommended package structure

**Pilot 1: Professional only (single site).** Basic exists as a lower-touch tier once the
verification-cost structure is understood (§14 shows Basic's thin margin is a real question).
Portfolio stays deferred. The pilot therefore tests the *full-value* package rather than a
stripped one — cleaner evidence for "what is the strongest monthly proposition". [PROPOSED]

---

## 11. Commercial unit

**Validate subscription-per-monitored-website as the anchor** [PROPOSED; assumption to validate
in the pilot interview]:

- **Website / monitored domain** — the natural unit: one domain = one Passport record, one
  history, one verdict. The product's value is *continuous monitoring of that website*, so the
  unit is the monitored website per month.
- **Pages, frequency, checks, content dimensions** — levers *inside* a site tier (page cap,
  weekly vs daily, fact-set coverage), not separate units.
- **Portfolio size** — scales as site count (future Portfolio tier).
- **Remediation** — a separate services engagement, not a subscription unit.
- **Per-scan pricing** — rejected for the firm channel (spiky, unpredictable, doesn't express
  the recurrence value); it remains the later agent/API channel (Model B in the Gate 4 prep).

**Validation check for the pilot interview:** ask the customer whether the monthly fee feels
tied to "this website being watched" (unit correct) vs "each scan I buy" (unit wrong).

---

## 12. Pilot duration — **30 days** [PROPOSED]

- **14 days is too short:** only 2 weekly scans — cannot credibly demonstrate recurring
  monitoring or a change/alert cycle, and no room for a remediation-recheck loop.
- **60 days delays** the commercial decision without adding a qualitatively different signal.
- **30 days:** 4–5 weekly scans, at least one full alert→report→(remediation-recheck if opted)
  cycle, one monthly evidence report, and a renewal decision at day 30. This is the shortest
  period that credibly tests recurrence.

---

## 13. Pilot success metrics

| Category | Metric | How measured | Current baseline |
|---|---|---|---|
| Customer value | meaningful issues discovered | count + "didn't know this" per finding | Sikatrix: 2 critical + 7 informational (CONFIRMED); external: UNKNOWN |
| | perceived severity | pilot-end interview (agree/disagree scale) | UNKNOWN |
| | time saved | customer estimate vs prior practice | UNKNOWN |
| | action taken | did the customer fix/plan anything | UNKNOWN |
| Product value | findings understood | interview | UNKNOWN |
| | **false-positive rate** | FP/(FP+TP) from `/findings/review` rulings — the scaffold is the meter | 0 recorded yet; first value is a pilot deliverable |
| | verification burden | hours of human verification per site-month (tracked) | Gate 3/4 estimate §14 |
| | alert usefulness | did alerts trigger action; interview | no alert fired yet (no material change on sikatrix) |
| | repeat/change findings | `/changes` records over the pilot | sikatrix: informational-only so far |
| | report usefulness | interview | UNKNOWN |
| Commercial value | willingness to pay | renewal decision at day 30 + stated ceiling | UNKNOWN — the pilot's core unknown |
| | acceptable price range | interview | UNKNOWN |
| | preferred package | interview | UNKNOWN |
| | continue/recommend intent | interview (would you continue at R499? recommend to a peer?) | UNKNOWN |
| | reference/testimonial willingness | interview (optional) | UNKNOWN |

---

## 14. Operating economics (assumptions labelled; no false precision)

Per monitored site/month at **pilot scale (1–3 sites)**, using actual current infrastructure:

| Cost item | Estimate | Basis |
|---|---|---|
| Compute (Workers) | ~R2–5 | Paid plan $5/mo fixed shared across all sites; weekly scans use trivial CPU; subrequests (the scans' own fetches) are NOT billed [CONFIRMED — COST-MODEL.md] |
| Model/API | **R0** | Deterministic regex extraction; no LLM/Ollama anywhere [CONFIRMED] |
| Storage (D1) | <R1 | ~5–10 KB raw per snapshot; weekly → tens of KB/month/site [CONFIRMED scale] |
| Notifications | R0 at pilot scale | webhook → email provider free tier (~100–300 emails/mo); provider choice UNKNOWN |
| **Human verification** | **R250–450** (≈0.6–1.1 h/site-month at R400/h internal blended: 0.625 h×R400 = R250, 1.125 h×R400 = R450) | agent-assisted evidence prep + Daniel/DSH rulings + quarterly ground-truth review (shared) + report review; the dominant cost — tracks FP rate directly |
| Remediation | R0 | excluded from the subscription (separately priced) |
| Support | R0–100 | Daniel-led at pilot scale |

**Gross margin per site/month — actual calculation (hypotheses; bands from the table above).**
Cost totals: **best = R252.50** (R2 + R0.50 storage + R250 + R0 support), **typical = R404.00**
(midpoints: R3.50 + R0.50 + R350 + R50), **worst = R556.00** (R5 + R1 + R450 + R100).

| Scenario | Cost/site-month | Margin @ **R499** | Margin @ **R299** |
|---|---|---|---|
| Best (min costs) | R252.50 | (499−252.50)/499 = **+49%** | (299−252.50)/299 = **+16%** |
| Typical (midpoints — assumed scenario) | R404.00 | (499−404)/499 = **+19%** | (299−404)/299 = **−35%** |
| Worst (max costs) | R556.00 | (499−556)/499 = **−11%** | (299−556)/299 = **−86%** |

**Corrected stated ranges (true extremes of the given bands):** R499 → **−11% to +49%**; R299 →
**−86% to +16%**. *(The earlier "+5% to +40%" and "−15% to +5%" in this report were an unstated
mid-scenario blend and are wrong as extremes — superseded by this table. The typical scenario is
explicitly assumed as the midpoint blend, R404/site-month.)*

- **R499 (Professional):** typical **+19%**, worst-case −11% — viable at pilot scale only if
  actual verification hours land near the typical band (the pilot measures this).
- **R299 (Basic):** typical **−35%**, best-case only +16% — **structurally unviable at pilot
  scale with the current verification practice**; Basic should be a lower-verification tier
  (e.g., no per-finding review) or deferred until FP automation cuts the cost band.
- At **10+ sites** (GA), fixed costs amortise and shared ground truth + lower FP → margins
  structurally higher.

**Honest conclusion:** at R499 the typical pilot-scale case is positive but thin (+19%), with a
−11% worst case; at R299 it is negative in the typical case. The pilot must *measure* actual
verification hours per site-month (the swing between best and worst is ~R300/site-month — bigger
than the price difference) and actual WTP; that measurement converts the hypothesis into a
number. The FP-review scaffold is the margin lever:
every FP removed cuts paid human time. [All figures PROPOSED hypotheses with the assumptions
above; infra facts CONFIRMED.]

---

## 15. Human vs automated workflow (commercial evidence loop)

| Stage | Classification | Detail |
|---|---|---|
| Customer onboarded | human-controlled | Daniel: contract, invoice, kickoff call |
| Baseline Passport | automated + agent-assisted review | scan + report assembled automatically; Daniel reviews before issue |
| Continuous monitoring | automated | weekly cron scans, persistence, change records |
| Finding/change detected | automated | comparator + findings; change records with provenance |
| Evidence verified | agent-assisted → human-approved | deterministic extraction; regulatory facts already human-approved; content judgments (e.g., R177 class) ruled by Daniel |
| Customer notified | automated (trigger) → human-controlled (comms) | alert email automated; any customer communication is Daniel-led |
| Customer acts | human-controlled | customer fixes/decides (remediation optional, separate) |
| Production state rechecked | automated | re-scan after any change |
| Passport updated | automated | verdict/history/report refresh |
| Customer sees continuing value | agent-assisted (report) + human (conversation) | monthly report + renewal conversation |

**Governance preserved:** *agents provide capability; DSH provides authority* — DSH never rules
its own findings, never approves its own facts, never unilaterally remediates or prices.

---

## 16. Minimum DSH requirements

**P0 — absolutely required before the pilot:**
- **Onboarding runbook** (documented): add the customer domain to `MONITOR_DOMAINS`, redeploy,
  verify baseline; the current config-based onboarding is fine for 1–3 customers — **do not
  automate it yet**. [PROPOSED]
- **Alert email delivery**: set `ALERT_WEBHOOK_URL` + Daniel's choice of email provider (e.g.,
  Resend/Brevo free tier) — the mechanism exists; only the key/endpoint is missing.
- **Invoice template + pilot contract** (Daniel-side, one page).
- Findings-review workflow: exists (endpoint); Daniel's rulings are the input.

**P1 — useful, but manual is fine during the pilot:**
- Per-customer report packaging (PDF from `/report` — agent-assisted, manual email).
- Verification-hour tracking (a simple sheet; do not build tooling for one customer).

**P2 — future scale:**
- Portal, multi-tenant onboarding, self-serve, automated digest emailing, Portfolio tier.

**Explicitly NOT required:** any new infrastructure, agent orchestration, portal, payment
system, local-model/Ollama, or monitoring platform.

---

## 17. Explicitly deferred build items (mandatory — do not build the business around
hypothetical demand)

| Item | Status |
|---|---|
| Complex multi-agent orchestration | DEFER |
| Autonomous remediation (without approval) | DEFER — human approval mandatory |
| Customer self-service portal | DEFER — report/PDF suffices |
| Broad SEO tooling | DEFER (P1/P2 from recon §12) |
| Elaborate dashboards | DEFER |
| Multi-tenancy beyond the pilot | DEFER |
| New local-model infrastructure / Ollama | DEFER (unchanged) |
| Additional payment infrastructure | DEFER — invoice/EFT for the pilot |
| Advanced portfolio management | DEFER — Portfolio is a future tier |
| Unnecessary integrations | DEFER — none until a customer asks |

---

## 18. x402 treatment

- **Verification status (CONFIRMED):** no genuine end-to-end paid x402 transaction has been
  completed by SiteHealth or the Sikatrix VAT API; the payment handshake is unverified. This is
  not represented as verified anywhere in this plan.
- **Required for the proposed pilot? NO [PROPOSED]** — the pilot bills by **invoice/EFT**
  (conventional payment), which requires zero new infrastructure and does not compromise the
  architecture (the scan pipeline runs via the internal scheduled path; x402 stays in place as
  the agent-facing rail).
- **Recommendation:** x402 remains a **future agent-commerce rail, not a prerequisite** for
  SiteHealth commercial validation. Keep it tracked; do not attempt to solve it this phase
  unless explicitly instructed.

---

## 19. Recommended first external pilot

**One SME accounting practice** (rank-1, §4) with a compliance-figure-bearing public site,
selected by public-website research only (no contact this phase). Offer: **Professional package
(30 days, R499/site/month hypothesis), one site, baseline + weekly monitoring + change detection
+ email alerts + monthly evidence report; remediation excluded (separately priced); paid by
invoice/EFT.** Success = the §13 metrics, especially: WTP/renewal at day 30, FP rate, actual
verification hours (→ §14 economics), and a stated "would you pay monthly for this" answer.

**What Daniel would offer one real business tomorrow (the phase's final objective):** *"A
30-day pilot of a continuously monitored website health record for your practice's site — a
baseline Passport, weekly checks, alerts when something changes or a figure you publish goes
stale or wrong, and an evidence report at the end — R499 for the pilot month, renewable monthly,
with remediation as a separate engagement if you want it."* The evidence that determines further
investment: the §13 commercial metrics (esp. renewal + WTP) and the measured §14 margins.

---

## 20. Decisions requiring Daniel's approval

| Decision | Recommendation | Approval |
|---|---|---|
| Initial ICP | SA SME accounting/professional-services practice (§3) | Daniel |
| Pilot candidate | Rank-1 SME accounting practice, discovered via public-website research (§4, §19) | Daniel |
| Pilot duration | 30 days (§12) | Daniel |
| Pilot scope | Professional, 1 site, monitoring + alerts + report; remediation excluded (§7) | Daniel |
| Pricing hypothesis | R499/site/month Professional pilot rate, R299 Basic (hypotheses only, unpublished). **Status: on hold pending the §14 economics reconciliation — resolved in this revision** (§14 now shows the true band −11% to +49% at R499 with a +19% typical scenario; R299 typical −35% is structurally unviable at pilot scale). Reconfirm the R499 pilot rate before external communication (§9, §14) | Daniel |
| Customer-facing material | Polished Passport report from existing endpoints; no portal (§8) | Daniel |
| Payment method | Invoice/EFT for the pilot (§18) | Daniel |
| Additional DSH build | P0 only: onboarding runbook, alert webhook config, invoice template (§16) | Daniel |
| x402 treatment | Keep as unverified future rail; not a pilot prerequisite (§18) | Daniel |
| Cycle 3 | Remain blocked behind the Measurement Gate | **No change** |

---

*No execution beyond this preparation has occurred or is authorized. Nothing in this plan
contacts a customer, publishes pricing, or modifies the live system.*

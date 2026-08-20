# SiteHealth Passport — Pilot Onboarding Runbook (config-based, NOT automated)

**Applies to:** adding one pilot customer's website to the monitored set.
**Principle:** config-based onboarding — no automation for the first 1–3 customers (per
`GATE5-COMMERCIAL-VALIDATION-PLAN.md` §16 P0). Estimated effort: ~20 minutes + one deploy.
**Boundaries:** this runbook is a documented procedure; executing it on a new customer is a
separate, authorized step (contract + invoice first — see PILOT-CONTRACT.md / INVOICE-TEMPLATE.md).

---

## Preconditions (before touching the config)

1. Candidate identified + Daniel approved the approach (§4 shortlist).
2. Pilot contract signed, invoice issued (one-page contract + invoice templates in this folder).
3. The customer's canonical URL decided — **use the canonical host** (e.g. `https://www.x.co.za/`,
   not a redirecting alias). One URL per domain key — history/change detection are keyed by
   lowercased hostname, and two URLs on the same host would collide in the same history stream.

## Steps

### 1. Add the domain to `MONITOR_DOMAINS` (production `wrangler.jsonc`)

Edit the `vars.MONITOR_DOMAINS` value — it is a comma-separated list of full http(s) URLs:

```jsonc
"MONITOR_DOMAINS": "https://www.sikatrix.com/,https://www.<customer>.co.za/"
```

- Do NOT add `*.workers.dev` URLs — same-account worker→worker fetches return 404 at the edge
  (documented Gate 4 quirk); the fixture is monitored via staging only.
- Commit the config change with a message naming the customer domain and the pilot.

### 2. Deploy production

```bash
npx wrangler deploy          # uses wrangler.jsonc (production worker qzenta-security-snapshot)
```

Record the **deployment version id** from the output (e.g. `06a89bff-…` — same class of record
as every Gate). Edge propagation lag of ~1 min is expected (documented in the staging audit);
retry health checks if the first read returns the old spec.

### 3. Establish the baseline (temporary tight cron for 24–48 h)

The weekly cron (`0 6 * * 1`) would otherwise leave the customer without a baseline for up to a
week. Establish it immediately:

1. Temporarily set `triggers.crons` to `["*/2 * * * *"]` in `wrangler.jsonc`.
2. Deploy. The cron scans the new domain every 2 minutes; the first tick writes the **baseline
   snapshot**, the second tick produces the first change comparison.
3. After the baseline is recorded (see §4), restore `"0 6 * * 1"` and redeploy. Record both
   version ids in the customer's pilot record.

### 4. Verify the baseline (free endpoints)

```bash
# history: expect the first complete snapshot with content columns
curl 'https://sitehealth.qzenta.com/history?domain=<host>&limit=10'
# findings: expect the content-accuracy findings from the baseline scan
curl 'https://sitehealth.qzenta.com/findings?domain=<host>'
# report: the baseline Passport digest (the customer-facing artifact)
curl 'https://sitehealth.qzenta.com/report?domain=<host>'
# changes + alerts: expect empty until the second tick / first material change
curl 'https://sitehealth.qzenta.com/changes?domain=<host>'
curl 'https://sitehealth.qzenta.com/alerts?domain=<host>'
```

Acceptance checks:
- `/history` shows a snapshot with `status: complete`, `scannerVersion: snapshot-v3`,
  `contentStatus` populated (PASS/WARN/FAIL).
- `/findings` returns findings (if any) with `review: pending`.
- If `/findings` notes "ground-truth store unavailable" → check the production D1 ground truth
  (5 facts / 15 patterns — see GATE4-PRODUCTION-EVIDENCE.md §1) before proceeding.

### 5. Deliver the baseline + set the cadence

1. Generate the customer-facing baseline Passport from `/report` + `/findings` (agent-assisted
   assembly; Daniel reviews and sends — customer communication is human-controlled).
2. Confirm alert delivery config (see ALERT-EMAIL-BREVO.md) — until the Brevo adapter is
   approved, alerts are recorded in `/alerts` and delivered manually (P1 fallback).
3. Schedule the day-30 renewal decision + the §13 metrics interview.

## Rollback

- Remove the domain from `MONITOR_DOMAINS`, restore the weekly cron if temporarily changed,
  redeploy. History for the domain remains in D1 (evidence is never deleted on rollback).

## Record (per customer)

| Field | Value |
|---|---|
| Customer / domain | … |
| Canonical URL added | … |
| Baseline deploy version id | … |
| Final (weekly) deploy version id | … |
| Baseline date | … |
| Baseline verdict / content status | … |
| Baseline findings count (pending rulings) | … |

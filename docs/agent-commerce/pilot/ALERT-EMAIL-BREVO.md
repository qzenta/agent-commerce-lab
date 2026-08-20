# SiteHealth Passport — Alert Email Delivery: Qzenta Brevo Wiring Spec

**Status:** PREPARATION — configuration spec + the one required code delta, written out but
**NOT applied** (no production code change is authorized this phase). Alerts already work without
email: they are recorded in D1 and readable via `GET /alerts` (delivery error/null
`delivered_at` logged as "delivery not configured").

## 1. Current mechanism (CONFIRMED — live)

- `src/alerting.ts` `deliverAlert()` POSTs to `ALERT_WEBHOOK_URL` (env var) with
  `content-type: application/json` and a `sitehealth.alert` payload:
  `{ type, domain, detectedAt, changeId, materiality, verdictMoved, summary }`.
- **No auth headers are sent.** Failures are recorded on the alert row (never block the scan).

## 2. Brevo target (CONFIRMED — same pattern as the Sikatrix/Lavish Haus integration)

Reference: `lib/brevo.ts` in the sikatrix repo (the established Qzenta Brevo pattern):

- Endpoint: `POST https://api.brevo.com/v3/smtp/email`
- Headers: `api-key: <BREVO_API_KEY>` · `Content-Type: application/json`
- Body: `{ sender: {name, email}, to: [{email, name}], subject, htmlContent }`

## 3. The gap (why ALERT_WEBHOOK_URL cannot point directly at Brevo yet)

`deliverAlert` posts our alert JSON with **no api-key header** and a payload Brevo does not
accept. Pointing the URL at `api.brevo.com/v3/smtp/email` today would produce a recorded
`delivery_error` (401/malformed), not email.

## 4. Required code delta (PROPOSED — ~30 lines + tests; to be applied at pilot kickoff with
Daniel's approval)

Extend `deliverAlert` with an optional Brevo adapter so the alert is sent as a transactional
email when `ALERT_WEBHOOK_URL` is set to the Brevo endpoint and `BREVO_API_KEY` is a Wrangler
secret. Sketch (final shape in the PR when approved):

```ts
// alerting.ts (proposed addition)
async function sendBrevo(webhookUrl, alert, apiKey, recipient, fetchFn) {
  return fetchFn("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Qzenta SiteHealth", email: "sitehealth@qzenta.com" },
      to: [{ email: recipient }],
      subject: `SiteHealth alert — ${alert.domain} [${alert.materiality}]`,
      htmlContent:
        `<p>${alert.summary}</p>` +
        `<ul><li>Domain: ${alert.domain}</li><li>Detected: ${alert.detected_at}</li>` +
        `<li>Change id: ${alert.change_id ?? "n/a"}</li><li>Verdict moved: ${alert.verdict_moved}</li></ul>` +
        `<p>View evidence: https://sitehealth.qzenta.com/report?domain=${encodeURIComponent(alert.domain)}</p>`,
    }),
  });
}
```

Unit tests mirror the existing `test/alerting.test.ts` webhook tests (payload shape, 2xx/error
handling).

## 5. Configuration (to be set at pilot kickoff, with approval)

| Item | Value | Where |
|---|---|---|
| `BREVO_API_KEY` | Qzenta-owned Brevo account key (same account pattern as Lavish Haus / Sikatrix) | Wrangler **secret** (never a var/commit) |
| `ALERT_WEBHOOK_URL` | `https://api.brevo.com/v3/smtp/email` (after §4 is applied) | env var (wrangler.jsonc) |
| `ALERT_RECIPIENT_EMAIL` | customer contact + `info@qzenta.com` (sender/recipient addressing is DSH's call within the account) | env var |
| Sender | `Qzenta SiteHealth <sitehealth@qzenta.com>` | adapter constant |

The Brevo API key is not present in this environment (`BREVO_API_KEY` unset) — Daniel supplies it
from the Qzenta Brevo account when the adapter is approved.

## 6. Manual fallback during pilot 1 (P1 — no code, no approval needed)

Alerts are already recorded: DSH reads `GET /alerts?domain=<host>` each monitoring cycle and
emails the customer from the recorded summary (human-controlled delivery). The Brevo adapter
turns this into automated delivery later. This is the explicit "manually handled during the
pilot" path from `GATE5-COMMERCIAL-VALIDATION-PLAN.md` §16.

// Gate 4 smoke check against the staging worker (P0): cron-fed history,
// alerts, report digest, findings — via the free endpoints.
const base = process.argv[2] ?? "https://qzenta-sitehealth-staging.qzenta.workers.dev";

async function get(path) {
  const res = await fetch(base + path);
  const text = await res.text();
  return { status: res.status, text };
}

const out = { base, checks: {} };

for (const domain of ["qzenta-sitehealth-fixture.qzenta.workers.dev", "www.sikatrix.com"]) {
  const hist = await get(`/history?domain=${encodeURIComponent(domain)}`);
  let histJson = null;
  try { histJson = JSON.parse(hist.text); } catch {}
  out.checks[`history:${domain}`] = {
    status: hist.status,
    count: Array.isArray(histJson?.snapshots) ? histJson.snapshots.length : null,
    latest: histJson?.snapshots?.[0] ?? null,
  };
}

const alerts = await get("/alerts?domain=qzenta-sitehealth-fixture.qzenta.workers.dev");
let alertsJson = null;
try { alertsJson = JSON.parse(alerts.text); } catch {}
out.checks["alerts:fixture"] = { status: alerts.status, count: Array.isArray(alertsJson?.alerts) ? alertsJson.alerts.length : null, alerts: alertsJson?.alerts ?? [] };

const report = await get("/report?domain=qzenta-sitehealth-fixture.qzenta.workers.dev");
out.checks["report:fixture"] = { status: report.status, contentType: report.text.startsWith("#") ? "markdown" : "other", head: report.text.slice(0, 200) };

const findings = await get("/findings?domain=qzenta-sitehealth-fixture.qzenta.workers.dev");
let findingsJson = null;
try { findingsJson = JSON.parse(findings.text); } catch {}
out.checks["findings:fixture"] = { status: findings.status, count: Array.isArray(findingsJson?.findings) ? findingsJson.findings.length : null, first: findingsJson?.findings?.[0] ?? null };

const changes = await get("/changes?domain=qzenta-sitehealth-fixture.qzenta.workers.dev");
let changesJson = null;
try { changesJson = JSON.parse(changes.text); } catch {}
out.checks["changes:fixture"] = { status: changes.status, count: Array.isArray(changesJson?.changes) ? changesJson.changes.length : null };

console.log(JSON.stringify(out, null, 2));

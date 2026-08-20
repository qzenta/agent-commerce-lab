// Gate 4 D3 evidence collection — production (sitehealth.qzenta.com).
// Reads history, changes, alerts, report, findings for the monitored domain.
const base = process.argv[2] ?? "https://sitehealth.qzenta.com";
const domain = "www.sikatrix.com";

async function get(path) {
  const res = await fetch(base + path);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json };
}

const hist = await get(`/history?domain=${domain}&limit=100`);
const changes = await get(`/changes?domain=${domain}&limit=100`);
const alerts = await get(`/alerts?domain=${domain}&limit=100`);
const report = await get(`/report?domain=${domain}`);
const findings = await get(`/findings?domain=${domain}`);

const snaps = hist.json?.snapshots ?? [];
const out = {
  base,
  domain,
  history: {
    status: hist.status,
    count: snaps.length,
    rows: snaps.map((s) => ({
      snapshotId: s.snapshotId,
      scannedAt: s.scannedAt,
      scannerVersion: s.scannerVersion,
      scoringVersion: s.scoringVersion,
      status: s.status,
      httpStatus: s.httpStatus,
      headerScore: s.headerScore,
      verdictStatus: s.verdictStatus,
      verdictScore: s.verdictScore,
      contentScore: s.contentScore,
      contentStatus: s.contentStatus,
      contentPagesScanned: s.contentPagesScanned,
    })),
  },
  changes: { status: changes.status, count: changes.json?.changes?.length ?? 0, rows: changes.json?.changes ?? [] },
  alerts: { status: alerts.status, count: alerts.json?.alerts?.length ?? 0, rows: alerts.json?.alerts ?? [] },
  report: { status: report.status, markdown: report.text.slice(0, 1500) },
  findings: { status: findings.status, count: findings.json?.findings?.length ?? 0, rows: findings.json?.findings ?? [] },
};

// Determinism: consecutive content scores/statuses should be identical.
const contentRows = snaps.filter((s) => s.contentScore !== null);
out.determinism = {
  consecutiveIdentical: contentRows.slice(1).every((s, i) => s.contentScore === contentRows[i].contentScore && s.contentStatus === contentRows[i].contentStatus),
  contentScores: contentRows.map((s) => s.contentScore),
  contentStatuses: contentRows.map((s) => s.contentStatus),
};

console.log(JSON.stringify(out, null, 2));

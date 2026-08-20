// Gate 3 independent-verification runner (20 Aug 2026).
// Runs the EXACT content-check module that is deployed (bundled from
// src/content-check.ts) against live public URLs, using the same five approved
// facts + patterns that were loaded into the staging D1 (verified 5/15).
//
// Run: node --experimental-strip-types scripts/gate3-scan.mjs
// NOTE: exercises the deployed code locally; the paid staging endpoint itself
// requires an x402 payer (see Gate 3 evidence report §6 — payment path pending).
import { runContentCheck, CONTENT_MAX_PAGES } from "./gate3-check-bundle.mjs";
import { ZA_COMPLIANCE_FACTS, ZA_COMPLIANCE_PATTERNS } from "../ground-truth/za-compliance.ts";

const FIXTURE = "https://qzenta-sitehealth-fixture.qzenta.workers.dev/";
const SIKATRIX = "https://www.sikatrix.com/";
const asOf = new Date().toISOString().slice(0, 10);

const input = (originUrl) => ({
  originUrl,
  fetchFn: fetch,
  facts: ZA_COMPLIANCE_FACTS,
  superseded: [],
  patterns: ZA_COMPLIANCE_PATTERNS,
  asOf,
});

const summary = (r) => ({
  scope: r.scope,
  score: r.score,
  grade: r.grade,
  status: r.status,
  findings: r.findings,
  facts: r.facts,
});

async function main() {
  const out = { fixture: null, determinism: null, sikatrix: null };

  // (a) Fixture — deliberately wrong figures.
  const fixture = await runContentCheck(input(FIXTURE));
  out.fixture = summary(fixture);

  // (b) Determinism — same URL, same ground truth, scanned twice.
  const fixture2 = await runContentCheck(input(FIXTURE));
  out.determinism = {
    identicalFindings: JSON.stringify(fixture.findings) === JSON.stringify(fixture2.findings),
    identicalScore: fixture.score === fixture2.score && fixture.status === fixture2.status,
  };

  // (c) Live re-probe of a real SA compliance-content site (sikatrix.com).
  const sikatrix = await runContentCheck(input(SIKATRIX));
  out.sikatrix = summary(sikatrix);

  console.log(JSON.stringify(out, null, 2));

  // Assertions on the fixture (the independently-confirmable expectations):
  const f = fixture.findings;
  const checks = {
    fixtureReached: fixture.scope.pagesScanned >= 3,
    uifMismatchCritical: f.some((x) => x.type === "figure-mismatch" && x.factKey === "za.uif.monthly_ceiling_zar" && x.severity === "critical" && x.claim === "1476"),
    uifContradictionCritical: f.some((x) => x.type === "cross-page-contradiction" && x.factKey === "za.uif.monthly_ceiling_zar" && x.severity === "critical"),
    roeMismatchCritical: f.some((x) => x.type === "figure-mismatch" && x.factKey === "za.coida.roe_deadline" && x.severity === "critical" && x.claim === "03-31"),
    vatCorrectIsClean: !f.some((x) => x.factKey === "za.vat.mandatory_threshold_zar"),
    d4Cap: fixture.score <= 35 && fixture.status === "FAIL",
    determinism: out.determinism.identicalFindings && out.determinism.identicalScore,
  };
  const allPass = Object.values(checks).every(Boolean);
  console.log(JSON.stringify({ checks, allPass }, null, 2));
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error("RUNNER FAILED:", err);
  process.exit(1);
});

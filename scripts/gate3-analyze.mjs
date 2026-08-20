// Gate 3 evidence analysis (20 Aug 2026): parse the runner output + debug the
// duplicated UIF claim on the fixture home page.
import { readFileSync } from "node:fs";
import { runContentCheck, extractClaimsFromText, htmlToText } from "./gate3-check-bundle.mjs";
import { ZA_COMPLIANCE_FACTS, ZA_COMPLIANCE_PATTERNS } from "../ground-truth/za-compliance.ts";

const text = readFileSync("gate3-scan-output.json", "utf8").replace(/\r\n/g, "\n");
const firstEnd = text.indexOf('\n{\n  "checks"');
const results = JSON.parse(text.slice(0, firstEnd));
const checksJson = JSON.parse(text.slice(firstEnd));
console.log("runner checks:", JSON.stringify(checksJson, null, 2));

console.log("=== SIKATRIX FINDINGS (full) ===");
for (const f of results.sikatrix.findings) {
  console.log(`[${f.severity}] ${f.type} | ${f.factKey} | page=${f.pagePath} | claim=${f.claim} | groundTruth=${f.groundTruth}`);
  console.log(`    ${f.message}`);
}
console.log("\n=== SIKATRIX FACTS (per-fact claims/pages) ===");
for (const [k, v] of Object.entries(results.sikatrix.facts)) {
  console.log(`${k}: claims=[${v.claims.join(", ")}] pages=[${v.pages.join(", ")}]`);
}
console.log(`\nsikatrix scope: ${JSON.stringify(results.sikatrix.scope)} score=${results.sikatrix.score} status=${results.sikatrix.status}`);
console.log(`fixture scope: ${JSON.stringify(results.fixture.scope)} score=${results.fixture.score} status=${results.fixture.status}`);
console.log(`determinism: identicalFindings=${results.determinism.identicalFindings} identicalScore=${results.determinism.identicalScore}`);
console.log(`checks: ${JSON.stringify(results.checks)}`);

console.log("\n=== DUPLICATE DEBUG: fixture / claims ===");
const uif = ZA_COMPLIANCE_FACTS.find((f) => f.factKey === "za.uif.monthly_ceiling_zar");
const uifPatterns = ZA_COMPLIANCE_PATTERNS.filter((p) => p.factKey === uif.factKey);
const html = await (await fetch("https://qzenta-sitehealth-fixture.qzenta.workers.dev/")).text();
const pageText = htmlToText(html);
console.log("page text:", JSON.stringify(pageText));
const claims = extractClaimsFromText(pageText, "/", [uif], uifPatterns);
console.log("raw claims:", JSON.stringify(claims, null, 2));
for (const p of uifPatterns) {
  const re = new RegExp(p.pattern, "gi");
  const hits = [];
  let m;
  while ((m = re.exec(pageText)) !== null) {
    hits.push(m[0]);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  console.log(`pattern kind=${p.kind} src=${p.pattern} hits=${JSON.stringify(hits)}`);
}

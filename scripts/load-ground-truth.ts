// @ts-nocheck — operational script; deliberately untyped beyond minimal needs
// (it runs under `node --experimental-strip-types`, not through tsc).
//
// Ground-truth loader (SiteHealth Passport v2 P0).
//
// USAGE (human-approved action only — Daniel runs/approves this, DSH never runs
// it against the remote database unilaterally):
//
//   node --experimental-strip-types scripts/load-ground-truth.ts > /tmp/gt.sql
//   wrangler d1 execute qzenta-sitehealth-history --remote --file /tmp/gt.sql
//   # or --local for the local dev database
//
// The script only EMITS idempotent SQL (INSERT ... ON CONFLICT(fact_key) DO UPDATE,
// and same for fact_patterns keyed on (fact_key, kind, pattern)). It never
// connects to D1 itself — the operator's wrangler invocation is the write path,
// which keeps the Worker (and this repo's src/) structurally write-free.
//
// Idempotency: re-running emits the same statements; the ON CONFLICT clauses make
// repeat application a no-op (same values) or a metadata refresh (source_ref etc.).

import { ZA_COMPLIANCE_FACTS, ZA_COMPLIANCE_PATTERNS } from "../ground-truth/za-compliance.ts";

function esc(s) {
  return String(s).replace(/'/g, "''");
}

function factSql(f) {
  return `INSERT INTO ground_truth
    (fact_key, label, value, unit, jurisdiction, impact_class, applies_from, applies_until, source_tier, source_ref, approved_by, approved_at, notes)
  VALUES
    ('${esc(f.factKey)}', '${esc(f.label)}', '${esc(f.value)}', ${f.unit ? `'${esc(f.unit)}'` : "NULL"}, '${esc(f.jurisdiction)}', '${esc(f.impactClass)}', '${esc(f.appliesFrom)}', ${f.appliesUntil ? `'${esc(f.appliesUntil)}'` : "NULL"}, ${f.sourceTier}, '${esc(f.sourceRef)}', '${esc(f.approvedBy)}', '${esc(f.approvedAt)}', ${f.notes ? `'${esc(f.notes)}'` : "NULL"})
  ON CONFLICT(fact_key) DO UPDATE SET
    label = excluded.label, value = excluded.value, unit = excluded.unit,
    jurisdiction = excluded.jurisdiction, impact_class = excluded.impact_class,
    applies_from = excluded.applies_from, applies_until = excluded.applies_until,
    source_tier = excluded.source_tier, source_ref = excluded.source_ref,
    approved_by = excluded.approved_by, approved_at = excluded.approved_at,
    notes = excluded.notes;`;
}

function patternSql(p) {
  return `INSERT INTO fact_patterns (fact_key, kind, pattern, priority)
  VALUES ('${esc(p.factKey)}', '${esc(p.kind)}', '${esc(p.pattern)}', ${p.priority})
  ON CONFLICT(fact_key, kind, pattern) DO UPDATE SET priority = excluded.priority;`;
}

const lines = [
  "BEGIN;",
  ...ZA_COMPLIANCE_FACTS.map(factSql),
  ...ZA_COMPLIANCE_PATTERNS.map(patternSql),
  "COMMIT;",
];

process.stdout.write(lines.join("\n") + "\n");

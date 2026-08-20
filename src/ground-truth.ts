/**
 * Ground-truth store accessor — SELECT-only, effective-date windowed.
 *
 * Gate 1 design (approved): the Worker never writes ground truth. Rows are loaded
 * only via scripts/load-ground-truth.ts under human approval; every row carries
 * approved_by / approved_at / source_ref. The SELECT-only property is structural
 * (no write statement exists in this module or anywhere in src/).
 *
 * Window semantics: a fact is "active" on date `asOf` (YYYY-MM-DD) iff
 *   applies_from <= asOf < applies_until   (applies_until NULL = open-ended/current).
 * Rows with an applies_until are superseded history — used only for figure-stale
 * classification, never as current ground truth.
 */

export type ImpactClass =
  | "money"
  | "compliance-deadline"
  | "compliance-threshold"
  | "informational";

export interface GroundTruthFact {
  factKey: string;
  label: string;
  value: string; // canonical, e.g. "2300000" (ZAR) or "06-30" (month-day)
  unit: string | null;
  jurisdiction: string; // "ZA"
  impactClass: ImpactClass;
  appliesFrom: string; // YYYY-MM-DD
  appliesUntil: string | null; // YYYY-MM-DD or null (current)
  sourceTier: number; // 1 = gazette/statutory, 2 = official regulator page, 3 = inferred
  sourceRef: string;
  approvedBy: string;
  approvedAt: string;
  notes?: string | null;
}

export type FactPatternKind = "value" | "context" | "keyword";

export interface FactPattern {
  factKey: string;
  kind: FactPatternKind;
  pattern: string; // JS regex source
  priority: number;
}

/** Pure windowing — unit-testable without D1. */
export function activeFactsAsOf(facts: GroundTruthFact[], asOf: string): GroundTruthFact[] {
  return facts.filter(
    (f) => f.appliesFrom <= asOf && (f.appliesUntil === null || asOf < f.appliesUntil)
  );
}

/** Facts whose window has ended on or before `asOf` (superseded history). */
export function supersededFactsAsOf(facts: GroundTruthFact[], asOf: string): GroundTruthFact[] {
  return facts.filter((f) => f.appliesUntil !== null && f.appliesUntil <= asOf);
}

export async function loadActiveFacts(
  db: D1Database,
  jurisdiction: string,
  asOf: string
): Promise<GroundTruthFact[]> {
  const res = await db
    .prepare(
      `SELECT fact_key AS factKey, label, value, unit, jurisdiction, impact_class AS impactClass,
              applies_from AS appliesFrom, applies_until AS appliesUntil,
              source_tier AS sourceTier, source_ref AS sourceRef,
              approved_by AS approvedBy, approved_at AS approvedAt, notes
       FROM ground_truth
       WHERE jurisdiction = ?1 AND applies_from <= ?2
         AND (applies_until IS NULL OR applies_until > ?2)`
    )
    .bind(jurisdiction, asOf)
    .all();
  return res.results as unknown as GroundTruthFact[];
}

export async function loadFactPatterns(
  db: D1Database,
  factKeys: string[]
): Promise<FactPattern[]> {
  if (factKeys.length === 0) return [];
  const placeholders = factKeys.map((_, i) => `?${i + 1}`).join(", ");
  const res = await db
    .prepare(
      `SELECT fact_key AS factKey, kind, pattern, priority
       FROM fact_patterns
       WHERE fact_key IN (${placeholders})
       ORDER BY priority ASC`
    )
    .bind(...factKeys)
    .all();
  return res.results as unknown as FactPattern[];
}

/** Superseded rows whose window ended on or before `asOf` (figure-stale inputs). */
export async function loadSupersededFacts(
  db: D1Database,
  jurisdiction: string,
  asOf: string
): Promise<GroundTruthFact[]> {
  const res = await db
    .prepare(
      `SELECT fact_key AS factKey, label, value, unit, jurisdiction, impact_class AS impactClass,
              applies_from AS appliesFrom, applies_until AS appliesUntil,
              source_tier AS sourceTier, source_ref AS sourceRef,
              approved_by AS approvedBy, approved_at AS approvedAt, notes
       FROM ground_truth
       WHERE jurisdiction = ?1 AND applies_until IS NOT NULL AND applies_until <= ?2`
    )
    .bind(jurisdiction, asOf)
    .all();
  return res.results as unknown as GroundTruthFact[];
}

/** Group facts by factKey (current + superseded rows together). */
export function groupFactsByKey(facts: GroundTruthFact[]): Map<string, GroundTruthFact[]> {
  const byKey = new Map<string, GroundTruthFact[]>();
  for (const f of facts) {
    const arr = byKey.get(f.factKey) ?? [];
    arr.push(f);
    byKey.set(f.factKey, arr);
  }
  return byKey;
}

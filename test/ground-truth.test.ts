import { describe, expect, it } from "vitest";
import {
  activeFactsAsOf,
  supersededFactsAsOf,
  loadActiveFacts,
  loadSupersededFacts,
  loadFactPatterns,
  groupFactsByKey,
  type GroundTruthFact,
  type FactPattern,
} from "../src/ground-truth";
import {
  ZA_COMPLIANCE_FACTS,
  ZA_COMPLIANCE_PATTERNS,
  APPROVED_BY,
  APPROVED_AT,
} from "../ground-truth/za-compliance";

// ---------------------------------------------------------------------------
// Pure windowing logic
// ---------------------------------------------------------------------------

function fact(overrides: Partial<GroundTruthFact>): GroundTruthFact {
  return {
    factKey: "za.test.fact",
    label: "Test fact",
    value: "1",
    unit: "ZAR/year",
    jurisdiction: "ZA",
    impactClass: "informational",
    appliesFrom: "2026-01-01",
    appliesUntil: null,
    sourceTier: 2,
    sourceRef: "test",
    approvedBy: "Test",
    approvedAt: "2026-08-20",
    ...overrides,
  };
}

describe("activeFactsAsOf (effective-date windowing)", () => {
  const current = fact({ factKey: "a", appliesFrom: "2026-01-01", appliesUntil: null });
  const superseded = fact({ factKey: "b", appliesFrom: "2020-01-01", appliesUntil: "2026-03-31" });
  const future = fact({ factKey: "c", appliesFrom: "2027-01-01", appliesUntil: null });

  it("includes current facts, excludes superseded (window closed) and future facts", () => {
    const active = activeFactsAsOf([current, superseded, future], "2026-08-20");
    expect(active.map((f) => f.factKey)).toEqual(["a"]);
  });

  it("treats a fact as active on its applies_from date", () => {
    expect(activeFactsAsOf([fact({ factKey: "d", appliesFrom: "2026-08-20" })], "2026-08-20").length).toBe(1);
  });

  it("treats a superseded fact as active strictly before its applies_until", () => {
    const s = fact({ appliesFrom: "2020-01-01", appliesUntil: "2026-03-31" });
    expect(activeFactsAsOf([s], "2026-03-30").length).toBe(1);
    expect(activeFactsAsOf([s], "2026-03-31").length).toBe(0);
  });

  it("separates superseded history for figure-stale classification", () => {
    const gone = fact({ factKey: "old", appliesUntil: "2026-03-31" });
    const still = fact({ factKey: "new", appliesUntil: null });
    expect(supersededFactsAsOf([gone, still], "2026-08-20").map((f) => f.factKey)).toEqual(["old"]);
  });
});

describe("groupFactsByKey", () => {
  it("groups current + superseded rows of the same fact together", () => {
    const g = groupFactsByKey([
      fact({ factKey: "k", appliesFrom: "2020-01-01", appliesUntil: "2026-03-31" }),
      fact({ factKey: "k", appliesFrom: "2026-04-01", appliesUntil: null }),
    ]);
    expect(g.get("k")?.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Seed integrity — every approved fact is loadable and pattern-backed
// ---------------------------------------------------------------------------

describe("za-compliance seed (Gate 1 ruling D3)", () => {
  it("contains exactly the five approved facts, all with approver metadata", () => {
    expect(ZA_COMPLIANCE_FACTS).toHaveLength(5);
    for (const f of ZA_COMPLIANCE_FACTS) {
      expect(f.approvedBy).toBe(APPROVED_BY);
      expect(f.approvedAt).toBe(APPROVED_AT);
      expect(f.sourceRef.length).toBeGreaterThan(10);
      expect(f.jurisdiction).toBe("ZA");
      expect(f.appliesUntil).toBeNull(); // no superseded rows seeded in P0
    }
  });

  it("has unique fact keys and the exact approved values", () => {
    const byKey = new Map(ZA_COMPLIANCE_FACTS.map((f) => [f.factKey, f.value]));
    expect(byKey.get("za.vat.mandatory_threshold_zar")).toBe("2300000");
    expect(byKey.get("za.vat.voluntary_threshold_zar")).toBe("120000");
    expect(byKey.get("za.uif.monthly_ceiling_zar")).toBe("17712");
    expect(byKey.get("za.coida.roe_deadline")).toBe("06-30");
    expect(byKey.get("za.emp501.reconciliation_end")).toBe("05-31");
    expect(byKey.size).toBe(5);
  });

  it("gives every approved fact at least one pattern; patterns reference only approved facts", () => {
    const factKeys = new Set(ZA_COMPLIANCE_FACTS.map((f) => f.factKey));
    for (const key of factKeys) {
      expect(ZA_COMPLIANCE_PATTERNS.some((p) => p.factKey === key)).toBe(true);
    }
    for (const p of ZA_COMPLIANCE_PATTERNS) {
      expect(factKeys.has(p.factKey)).toBe(true);
      expect(["value", "context", "keyword"].includes(p.kind)).toBe(true);
    }
  });

  it("gives money facts value+context patterns and deadline facts context+keyword patterns", () => {
    const money = ZA_COMPLIANCE_FACTS.find((f) => f.impactClass === "money")!;
    expect(ZA_COMPLIANCE_PATTERNS.filter((p) => p.factKey === money.factKey && p.kind === "value").length).toBeGreaterThan(0);
    expect(ZA_COMPLIANCE_PATTERNS.filter((p) => p.factKey === money.factKey && p.kind === "context").length).toBe(1);

    for (const f of ZA_COMPLIANCE_FACTS.filter((x) => x.impactClass === "compliance-deadline")) {
      expect(ZA_COMPLIANCE_PATTERNS.filter((p) => p.factKey === f.factKey && p.kind === "context").length).toBe(1);
      expect(ZA_COMPLIANCE_PATTERNS.filter((p) => p.factKey === f.factKey && p.kind === "keyword").length).toBe(1);
      // Deadline facts must not match bare dates without a topic window.
      expect(ZA_COMPLIANCE_PATTERNS.filter((p) => p.factKey === f.factKey && p.kind === "value").length).toBe(0);
    }
  });

  it("all patterns are valid JS regexes (deterministic extraction guarantee)", () => {
    for (const p of ZA_COMPLIANCE_PATTERNS) {
      expect(() => new RegExp(p.pattern, "i")).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// D1 loaders against a minimal fake
// ---------------------------------------------------------------------------

class FakeD1 {
  private rows: Array<Record<string, unknown>>;
  constructor(rows: Array<Record<string, unknown>>) {
    this.rows = rows;
  }
  prepare(sql: string) {
    return {
      bind: (..._values: unknown[]) => ({
        all: async () => ({ results: this.rows }),
      }),
    };
  }
}

describe("D1 ground-truth loaders", () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    factKey: "za.test.fact",
    label: "Test",
    value: "1",
    unit: "ZAR/year",
    jurisdiction: "ZA",
    impactClass: "compliance-threshold",
    appliesFrom: "2026-01-01",
    appliesUntil: null,
    sourceTier: 2,
    sourceRef: "src",
    approvedBy: APPROVED_BY,
    approvedAt: APPROVED_AT,
    ...overrides,
  });

  it("loads active facts through the SELECT-only accessor", async () => {
    const db = new FakeD1([row()]) as unknown as D1Database;
    const facts = await loadActiveFacts(db, "ZA", "2026-08-20");
    expect(facts[0].factKey).toBe("za.test.fact");
    expect(facts[0].impactClass).toBe("compliance-threshold");
    expect(facts[0].approvedBy).toBe(APPROVED_BY);
  });

  it("loads superseded facts (applies_until closed) and patterns", async () => {
    const db = new FakeD1([
      row({ factKey: "old", appliesUntil: "2026-03-31" }),
      row({ factKey: "new", appliesUntil: null }),
    ]) as unknown as D1Database;
    const superseded = await loadSupersededFacts(db, "ZA", "2026-08-20");
    expect(superseded.map((f) => f.factKey)).toEqual(["old", "new"]); // fake returns rows verbatim; windowing is the SQL's job

    const patDb = new FakeD1([
      { factKey: "za.test.fact", kind: "value", pattern: "R\\s*1\\b", priority: 10 },
    ]) as unknown as D1Database;
    const patterns = await loadFactPatterns(patDb, ["za.test.fact"]);
    expect(patterns[0].kind).toBe("value");
  });

  it("returns an empty pattern list for no fact keys", async () => {
    const db = new FakeD1([]) as unknown as D1Database;
    expect(await loadFactPatterns(db, [])).toEqual([]);
  });
});

// Type-level: FactPattern must stay structurally valid for the seed
const _patternTypeCheck: FactPattern = ZA_COMPLIANCE_PATTERNS[0];
void _patternTypeCheck;

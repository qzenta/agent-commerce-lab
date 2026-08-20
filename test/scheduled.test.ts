import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { runScheduledScans, parseMonitorDomains } from "../src/scheduled";
import { ZA_COMPLIANCE_FACTS, ZA_COMPLIANCE_PATTERNS } from "../ground-truth/za-compliance";

/**
 * Fake D1 covering the statements the scheduled scan path issues:
 * ground_truth/fact_patterns SELECTs (content dimension), snapshots + changes
 * INSERTs (history), alerts INSERT. An unknown statement throws loudly.
 */
class FakeD1 {
  snapshots: Array<Record<string, unknown>> = [];
  changes: Array<Record<string, unknown>> = [];
  alerts: Array<Record<string, unknown>> = [];
  private nextId = { s: 1, c: 1, a: 1 };

  prepare(sql: string) {
    const s = sql.replace(/\s+/g, " ").trim();

    if (s.includes("fact_patterns")) {
      return {
        bind: () => ({
          all: async () => ({
            results: ZA_COMPLIANCE_PATTERNS.filter((p) => p.factKey === "za.uif.monthly_ceiling_zar").map((p) => ({ factKey: p.factKey, kind: p.kind, pattern: p.pattern, priority: p.priority })),
          }),
        }),
      };
    }
    if (s.includes("FROM ground_truth") && s.includes("applies_until IS NOT NULL")) {
      return { bind: () => ({ all: async () => ({ results: [] }) }) };
    }
    if (s.includes("FROM ground_truth")) {
      const uif = ZA_COMPLIANCE_FACTS.find((f) => f.factKey === "za.uif.monthly_ceiling_zar")!;
      return {
        bind: () => ({
          all: async () => ({
            results: [
              { factKey: uif.factKey, label: uif.label, value: uif.value, unit: uif.unit, jurisdiction: uif.jurisdiction, impactClass: uif.impactClass, appliesFrom: uif.appliesFrom, appliesUntil: null, sourceTier: uif.sourceTier, sourceRef: uif.sourceRef, approvedBy: uif.approvedBy, approvedAt: uif.approvedAt, notes: null },
            ],
          }),
        }),
      };
    }

    const colsOf = (t: string) => s.match(new RegExp(`INSERT INTO ${t} \\(([^)]+)\\)`))?.[1].split(",").map((c) => c.trim()) ?? [];

    if (s.startsWith("INSERT INTO snapshots")) {
      const cols = colsOf("snapshots");
      return {
        bind: (...values: unknown[]) => ({
          run: async () => {
            const row: Record<string, unknown> = { id: this.nextId.s++ };
            cols.forEach((c, i) => (row[c] = values[i]));
            this.snapshots.push(row);
            return { meta: { last_row_id: row.id, changes: 1 } };
          },
        }),
      };
    }
    if (s.startsWith("INSERT INTO changes")) {
      const cols = colsOf("changes");
      return {
        bind: (...values: unknown[]) => ({
          run: async () => {
            const row: Record<string, unknown> = { id: this.nextId.c++ };
            cols.forEach((c, i) => (row[c] = values[i]));
            this.changes.push(row);
            return { meta: { last_row_id: row.id, changes: 1 } };
          },
        }),
      };
    }
    if (s.startsWith("INSERT INTO alerts")) {
      const cols = colsOf("alerts");
      return {
        bind: (...values: unknown[]) => ({
          run: async () => {
            const row: Record<string, unknown> = { id: this.nextId.a++ };
            cols.forEach((c, i) => (row[c] = values[i]));
            this.alerts.push(row);
            return { meta: { last_row_id: row.id, changes: 1 } };
          },
        }),
      };
    }
    if (s.includes("raw_snapshot FROM snapshots")) {
      return {
        bind: () => ({ first: async () => null }),
      };
    }
    if (s.includes("FROM snapshots") && s.includes("status = 'complete'")) {
      return {
        bind: () => ({ first: async () => null }),
      };
    }
    throw new Error("fake D1 (scheduled): unhandled SQL: " + s);
  }
}

function targetResponse(body: string): Response {
  return new Response(`<html><head></head><body>${body}</body></html>`, {
    status: 200,
    headers: {
      "strict-transport-security": "max-age=31536000; includeSubDomains",
      "content-security-policy": "default-src 'self'; frame-ancestors 'self'",
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "geolocation=()",
      server: "nginx",
    },
  });
}

function makeFetchStub() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "1.1.1.1") {
      const type = url.searchParams.get("type") ?? "";
      return type === "A"
        ? new Response(JSON.stringify({ Answer: [{ type: 1, data: "93.184.216.34" }] }), { status: 200 })
        : new Response(JSON.stringify({ Answer: [] }), { status: 200 });
    }
    if (url.pathname === "/sitemap.xml") return new Response("not found", { status: 404 });
    if (url.pathname === "/") return targetResponse('<a href="/calculator">calc</a>');
    if (url.pathname === "/calculator") return targetResponse("UIF is capped at R1 476 per month.");
    return targetResponse("ok");
  });
}

describe("parseMonitorDomains", () => {
  it("parses a comma-separated list, trims, and drops empties", () => {
    expect(parseMonitorDomains(" https://a.com , https://b.com ,")).toEqual(["https://a.com", "https://b.com"]);
    expect(parseMonitorDomains(undefined)).toEqual([]);
    expect(parseMonitorDomains("")).toEqual([]);
  });
});

describe("runScheduledScans (internal scan path)", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("scans monitored domains with content=true, persists snapshots (failed ones included, by design), and isolates throws", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const fake = new FakeD1();
    const db = fake as unknown as D1Database;
    const results = await runScheduledScans(db, {
      domains: ["https://fixture.example/", "not a url"],
      fetchFn: fetch,
    });
    expect(results).toHaveLength(2);
    // Valid domain: ok + snapshot stored with a content block (D4-capped FAIL).
    expect(results[0].ok).toBe(true);
    expect(results[0].error).toBeUndefined();
    // A malformed URL yields a FAILED snapshot (runSecuritySnapshot never
    // throws; failed observations are stored and visible in /history but never
    // used as comparison anchors — Cycle 2 design). ok stays true; the batch
    // never dies.
    expect(results[1].ok).toBe(true);
    expect(fake.snapshots.length).toBe(2);
    const raw = JSON.parse(String(fake.snapshots[0].raw_snapshot)) as { content: { score: number; status: string } };
    expect(raw.content.score).toBeLessThanOrEqual(35);
    expect(raw.content.status).toBe("FAIL");
    const failed = JSON.parse(String(fake.snapshots[1].raw_snapshot)) as { http: { error: string } };
    expect(failed.http.error).toMatch(/invalid URL/);
  });

  it("runs twice -> two snapshots (history accumulates); determinism at verdict level", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const fake = new FakeD1();
    const db = fake as unknown as D1Database;
    const r1 = await runScheduledScans(db, { domains: ["https://fixture.example/"], fetchFn: fetch });
    const r2 = await runScheduledScans(db, { domains: ["https://fixture.example/"], fetchFn: fetch });
    expect(fake.snapshots).toHaveLength(2);
    const c1 = JSON.parse(String(fake.snapshots[0].raw_snapshot));
    const c2 = JSON.parse(String(fake.snapshots[1].raw_snapshot));
    expect(c1.content.score).toBe(c2.content.score);
    expect(c1.content.status).toBe(c2.content.status);
    // NOTE: in node the TLS probe reports "cloudflare:sockets unavailable", so
    // snapshots are 'partial' and no comparison anchor exists — comparability/
    // alerts are exercised in the real Workers runtime (production cron) and in
    // the alerting unit suite.
    expect(r1[0].ok).toBe(true);
    expect(r2[0].ok).toBe(true);
  });

  it("handles a completely empty domain list", async () => {
    const fake = new FakeD1() as unknown as D1Database;
    const results = await runScheduledScans(fake, { domains: [] });
    expect(results).toEqual([]);
  });
});

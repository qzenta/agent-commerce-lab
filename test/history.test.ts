import { describe, expect, it } from "vitest";
import type { SecuritySnapshot } from "../src/snapshot";
import {
  SCANNER_VERSION,
  SCORING_VERSION,
} from "../src/versions";
import {
  computeChange,
  domainKey,
  insertChangeRow,
  insertSnapshotRow,
  listChangeHistory,
  listSnapshotHistory,
  parseListLimit,
  recordAndCompare,
  recordMateriality,
  runSnapshotWithHistory,
  snapshotStatus,
  snapshotToRow,
} from "../src/history";
import app from "../src/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep-merge helper so tests can override nested snapshot fields tersely. */
function deepMerge<T>(base: T, overrides: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(overrides)) {
    const existing = out[k];
    if (v && typeof v === "object" && !Array.isArray(v) && existing && typeof existing === "object") {
      out[k] = deepMerge(existing, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

/** A healthy, complete snapshot; override nested fields as needed. */
function makeSnapshot(overrides: Record<string, unknown> = {}): SecuritySnapshot {
  const base: SecuritySnapshot = {
    target: "https://example.com/",
    timestamp: "2026-08-19T10:00:00.000Z",
    http: {
      status: 200,
      ok: true,
      redirectChain: ["https://example.com/"],
      finalUrl: "https://example.com/",
      error: null,
    },
    tls: {
      usedHttps: true,
      protocol: "TLS 1.3",
      cipherSuite: "TLS_AES_128_GCM_SHA256",
      cipherSuiteId: "0x1301",
      weakCipher: false,
      probeError: null,
    },
    dns: {
      hasA: true,
      hasAAAA: true,
      hasMX: true,
      hasTXT: true,
      records: { A: ["93.184.216.34"], AAAA: [], MX: [], TXT: [] },
      note: "resolved via Cloudflare DNS-over-HTTPS (1.1.1.1)",
    },
    securityHeaders: {
      strictTransportSecurity: "max-age=31536000; includeSubDomains",
      contentSecurityPolicy: "default-src 'self'; frame-ancestors 'self'",
      xFrameOptions: "DENY",
      xContentTypeOptions: "nosniff",
      referrerPolicy: "strict-origin-when-cross-origin",
      permissionsPolicy: "geolocation=()",
    },
    headerScore: { score: 55, grade: "C", issues: [] },
    techObservations: { server: "nginx", poweredBy: null, poweredByCloudflare: false, cmsGuess: null },
    findings: [],
    verdict: { status: "PASS", score: 90, summary: "ok", topIssues: [] },
  };
  return deepMerge(base, overrides);
}

type Row = Record<string, unknown>;

/**
 * Minimal in-memory D1 fake implementing exactly the statements this app
 * issues (an unknown statement throws, so a wrong SQL string fails loudly).
 * Column lists are parsed from the INSERT text; SELECTs are matched on
 * distinctive fragments and applied against the in-memory tables.
 */
class FakeD1 {
  snapshots: Row[] = [];
  changes: Row[] = [];
  private nextSnapshotId = 1;
  private nextChangeId = 1;

  prepare(sql: string) {
    const s = sql.replace(/\s+/g, " ").trim();
    let exec: (...values: unknown[]) => unknown;

    if (s.startsWith("INSERT INTO snapshots")) {
      const cols = this.insertColumns(s);
      exec = (...values) => {
        const row: Row = { id: this.nextSnapshotId++ };
        cols.forEach((c, i) => (row[c] = values[i]));
        this.snapshots.push(row);
        return { meta: { last_row_id: row.id, changes: 1 } };
      };
    } else if (s.startsWith("INSERT INTO changes")) {
      const cols = this.insertColumns(s);
      exec = (...values) => {
        const row: Row = { id: this.nextChangeId++ };
        cols.forEach((c, i) => (row[c] = values[i]));
        this.changes.push(row);
        return { meta: { last_row_id: row.id, changes: 1 } };
      };
    } else if (s.includes("FROM snapshots") && s.includes("status = 'complete'")) {
      // getPriorCompleteSnapshot
      exec = (...values) => {
        const domain = values[0] as string;
        const before = values[1] as string;
        return (
          this.snapshots
            .filter((r) => r.domain === domain && r.status === "complete" && (r.scanned_at as string) < before)
            .sort((a, b) => (b.scanned_at as string).localeCompare(a.scanned_at as string))[0] ?? null
        );
      };
    } else if (s.includes("FROM snapshots") && s.includes("ORDER BY scanned_at DESC")) {
      // listSnapshots (with or without before cursor)
      const hasBefore = s.includes("AND scanned_at < ?");
      exec = (...values) => {
        const domain = values[0] as string;
        const before = hasBefore ? (values[1] as string) : undefined;
        const limit = (hasBefore ? values[2] : values[1]) as number;
        return {
          results: this.snapshots
            .filter((r) => r.domain === domain && (before === undefined || (r.scanned_at as string) < before))
            .sort((a, b) => (b.scanned_at as string).localeCompare(a.scanned_at as string))
            .slice(0, limit),
        };
      };
    } else if (s.includes("JOIN snapshots f") && s.includes("JOIN snapshots t")) {
      // listChanges (with or without before cursor)
      const hasBefore = s.includes("AND ch.detected_at < ?");
      exec = (...values) => {
        const domain = values[0] as string;
        const before = hasBefore ? (values[1] as string) : undefined;
        const limit = (hasBefore ? values[2] : values[1]) as number;
        return {
          results: this.changes
            .filter((r) => r.domain === domain && (before === undefined || (r.detected_at as string) < before))
            .sort((a, b) => (b.detected_at as string).localeCompare(a.detected_at as string))
            .slice(0, limit)
            .map((ch) => {
              const f = this.snapshots.find((x) => x.id === ch.from_snapshot_id)!;
              const t = this.snapshots.find((x) => x.id === ch.to_snapshot_id)!;
              return {
                change_id: ch.id,
                domain: ch.domain,
                detected_at: ch.detected_at,
                comparable: ch.comparable,
                changed_fields: ch.changed_fields,
                score_delta: ch.score_delta,
                verdict_moved: ch.verdict_moved,
                from_id: f.id,
                from_scanned_at: f.scanned_at,
                from_scanner_version: f.scanner_version,
                from_scoring_version: f.scoring_version,
                to_id: t.id,
                to_scanned_at: t.scanned_at,
                to_scanner_version: t.scanner_version,
                to_scoring_version: t.scoring_version,
              };
            }),
        };
      };
    } else {
      throw new Error("fake D1: unhandled SQL: " + s);
    }

    return {
      bind: (...values: unknown[]) => ({
        first: async () => exec(...values),
        all: async () => exec(...values) as { results: unknown[] },
        run: async () => exec(...values),
      }),
    };
  }

  private insertColumns(sql: string): string[] {
    const m = sql.match(/INSERT INTO \w+ \(([^)]+)\)/);
    if (!m) throw new Error("fake D1: cannot parse INSERT: " + sql);
    return m[1].split(",").map((c) => c.trim());
  }
}

const TEST_PAY_TO = "0x1866Fd80B1196AcC70A98a50917A8FD4639FE823";

function makeEnv(fake: FakeD1, overrides: Record<string, unknown> = {}) {
  return {
    X402_NETWORK: "base-sepolia",
    X402_PAY_TO: TEST_PAY_TO,
    DISCOVERY_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SNAPSHOT_RATE_LIMITER: { limit: async () => ({ success: true }) },
    HISTORY_DB: fake,
    ...overrides,
  } as unknown as Parameters<typeof app.request>[2];
}

// ---------------------------------------------------------------------------
// Versions (freeze — a bump must be deliberate)
// ---------------------------------------------------------------------------

describe("version constants", () => {
  it("freezes the current scanner/scoring versions (bump = deliberate act)", () => {
    expect(SCANNER_VERSION).toBe("snapshot-v1");
    expect(SCORING_VERSION).toBe("scoring-v1");
  });
});

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

describe("snapshotStatus (Section F)", () => {
  it("marks an unreachable target (http.error set) as failed", () => {
    const snap = makeSnapshot({ http: { error: "connection refused", status: null, ok: false } });
    expect(snapshotStatus(snap)).toBe("failed");
  });

  it("marks a snapshot with a failed TLS probe as partial", () => {
    const snap = makeSnapshot({ tls: { probeError: "no ServerHello received within timeout" } });
    expect(snapshotStatus(snap)).toBe("partial");
  });

  it("marks a snapshot with un-evaluated DNS as partial", () => {
    const snap = makeSnapshot({ dns: { note: "not evaluated", hasA: false } });
    expect(snapshotStatus(snap)).toBe("partial");
  });

  it("marks a clean observation complete even when the verdict is FAIL", () => {
    const snap = makeSnapshot({ verdict: { status: "FAIL" } });
    expect(snapshotStatus(snap)).toBe("complete");
  });
});

describe("snapshotToRow", () => {
  it("attaches versions, status, summary columns, and the raw JSON", () => {
    const snap = makeSnapshot();
    const row = snapshotToRow("example.com", snap);
    expect(row.domain).toBe("example.com");
    expect(row.scanner_version).toBe(SCANNER_VERSION);
    expect(row.scoring_version).toBe(SCORING_VERSION);
    expect(row.status).toBe("complete");
    expect(row.used_https).toBe(1);
    expect(row.verdict_status).toBe("PASS");
    expect(JSON.parse(row.raw_snapshot)).toEqual(snap);
  });
});

describe("domainKey", () => {
  it("keys on the lowercased hostname", () => {
    expect(domainKey("https://Example.COM/foo")).toBe("example.com");
  });
});

// ---------------------------------------------------------------------------
// Comparator (Section D + E)
// ---------------------------------------------------------------------------

describe("computeChange", () => {
  const priorMeta = { id: 1, scanned_at: "2026-08-19T09:00:00.000Z", scanner_version: SCANNER_VERSION, scoring_version: SCORING_VERSION };
  const currentMeta = { id: 2, scanned_at: "2026-08-19T10:00:00.000Z", scanner_version: SCANNER_VERSION, scoring_version: SCORING_VERSION };

  it("returns a clean comparable result for identical snapshots", () => {
    const r = computeChange(priorMeta, makeSnapshot(), currentMeta, makeSnapshot());
    expect(r.comparable).toBe(true);
    expect(r.reason).toBe("same scoring model");
    expect(r.changedFields).toHaveLength(0);
    expect(r.scoreDelta).toBe(0);
    expect(r.verdictMoved).toBe(false);
  });

  it("flags an HTTPS->HTTP downgrade as critical", () => {
    const prior = makeSnapshot();
    const current = makeSnapshot({ tls: { usedHttps: false }, verdict: { status: "WARN", score: 20 } });
    const r = computeChange(priorMeta, prior, currentMeta, current);
    const f = r.changedFields.find((x) => x.field === "tls.usedHttps");
    expect(f?.materiality).toBe("critical");
    expect(f?.from).toBe(true);
    expect(f?.to).toBe(false);
  });

  it("flags a verdict PASS->FAIL as critical", () => {
    const r = computeChange(priorMeta, makeSnapshot(), currentMeta, makeSnapshot({ verdict: { status: "FAIL", score: 30 } }));
    const f = r.changedFields.find((x) => x.field === "verdict.status");
    expect(f?.materiality).toBe("critical");
    expect(r.verdictMoved).toBe(true);
  });

  it("flags a new weak cipher as critical", () => {
    const r = computeChange(priorMeta, makeSnapshot(), currentMeta, makeSnapshot({ tls: { weakCipher: true, cipherSuite: "RSA-AES128-CBC-SHA", cipherSuiteId: "0x002f" } }));
    const f = r.changedFields.find((x) => x.field === "tls.weakCipher");
    expect(f?.materiality).toBe("critical");
  });

  it("flags a security header removal as material", () => {
    const current = makeSnapshot({ securityHeaders: { strictTransportSecurity: null } });
    const r = computeChange(priorMeta, makeSnapshot(), currentMeta, current);
    const f = r.changedFields.find((x) => x.field === "securityHeaders.strictTransportSecurity");
    expect(f?.materiality).toBe("material");
  });

  it("flags an HSTS value change as material, but ignores XFO value changes", () => {
    const hstsChanged = computeChange(
      priorMeta,
      makeSnapshot(),
      currentMeta,
      makeSnapshot({ securityHeaders: { strictTransportSecurity: "max-age=60" } })
    );
    expect(hstsChanged.changedFields.find((x) => x.field === "securityHeaders.strictTransportSecurity")?.materiality).toBe("material");

    const xfoChanged = computeChange(
      priorMeta,
      makeSnapshot(),
      currentMeta,
      makeSnapshot({ securityHeaders: { xFrameOptions: "SAMEORIGIN" } })
    );
    expect(xfoChanged.changedFields.find((x) => x.field === "securityHeaders.xFrameOptions")).toBeUndefined();
  });

  it("flags tech fingerprint changes as informational", () => {
    const r = computeChange(priorMeta, makeSnapshot(), currentMeta, makeSnapshot({ techObservations: { server: "cloudflare" } }));
    const f = r.changedFields.find((x) => x.field === "techObservations.server");
    expect(f?.materiality).toBe("informational");
  });

  it("computes scoreDelta as current minus prior verdict score", () => {
    const prior = makeSnapshot({ verdict: { score: 90 } });
    const current = makeSnapshot({ verdict: { score: 70 } });
    const r = computeChange(priorMeta, prior, currentMeta, current);
    expect(r.scoreDelta).toBe(-20);
  });

  it("refuses comparison across a scoring_version boundary (mandatory)", () => {
    const r = computeChange(
      { ...priorMeta, scoring_version: "scoring-v0" },
      makeSnapshot(),
      currentMeta,
      makeSnapshot()
    );
    expect(r.comparable).toBe(false);
    expect(r.reason).toBe("scoring model changed between observations");
    expect(r.scoreDelta).toBeNull();
    expect(r.changedFields).toHaveLength(0);
  });

  it("refuses comparison across a scanner_version boundary (conservative)", () => {
    const r = computeChange(
      { ...priorMeta, scanner_version: "snapshot-v0" },
      makeSnapshot(),
      currentMeta,
      makeSnapshot()
    );
    expect(r.comparable).toBe(false);
    expect(r.reason).toBe("scanner model changed between observations");
  });

  it("is deterministic", () => {
    const a = computeChange(priorMeta, makeSnapshot(), currentMeta, makeSnapshot({ http: { status: 500, ok: false } }));
    const b = computeChange(priorMeta, makeSnapshot(), currentMeta, makeSnapshot({ http: { status: 500, ok: false } }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("recordMateriality", () => {
  it("returns null for non-comparable results", () => {
    expect(recordMateriality({ comparable: false, reason: "x", changedFields: [], scoreDelta: null, verdictMoved: false })).toBeNull();
  });
  it("critical wins", () => {
    expect(recordMateriality({ comparable: true, reason: "same scoring model", changedFields: [{ field: "a", from: 1, to: 2, materiality: "informational" }, { field: "b", from: 1, to: 2, materiality: "critical" }], scoreDelta: 0, verdictMoved: false })).toBe("critical");
  });
  it("score delta >= 15 is material", () => {
    expect(recordMateriality({ comparable: true, reason: "same scoring model", changedFields: [], scoreDelta: -15, verdictMoved: false })).toBe("material");
  });
  it("small deltas without fields are informational", () => {
    expect(recordMateriality({ comparable: true, reason: "same scoring model", changedFields: [], scoreDelta: -5, verdictMoved: false })).toBe("informational");
  });
});

// ---------------------------------------------------------------------------
// Store + orchestration (fake D1)
// ---------------------------------------------------------------------------

describe("D1 store + recordAndCompare", () => {
  it("writes one snapshot row on first scan, no change row, explicit reason (AC3)", async () => {
    const fake = new FakeD1();
    const db = fake as unknown as D1Database;
    const res = await recordAndCompare(db, makeSnapshot({ timestamp: "2026-08-19T10:00:00.000Z" }));
    expect(res.comparable).toBe(false);
    expect(res.reason).toBe("no prior snapshot");
    expect(res.from).toBeNull();
    expect(res.to?.scoringVersion).toBe(SCORING_VERSION);
    expect(res.changeId).toBeUndefined();
    expect(fake.snapshots).toHaveLength(1);
    expect(fake.changes).toHaveLength(0);
  });

  it("writes a change row with a field-level diff on the second scan (AC4)", async () => {
    const fake = new FakeD1();
    const db = fake as unknown as D1Database;
    await recordAndCompare(db, makeSnapshot({ timestamp: "2026-08-19T09:00:00.000Z" }));
    const res = await recordAndCompare(
      db,
      makeSnapshot({ timestamp: "2026-08-19T10:00:00.000Z", http: { status: 500, ok: false }, verdict: { status: "WARN", score: 60 } })
    );
    expect(res.comparable).toBe(true);
    expect(res.reason).toBe("same scoring model");
    expect(res.changeId).toBe(1);
    expect(res.changedFields.some((f) => f.field === "http.status" && f.materiality === "material")).toBe(true);
    expect(res.scoreDelta).toBe(-30);
    expect(fake.snapshots).toHaveLength(2);
    expect(fake.changes).toHaveLength(1);
  });

  it("refuses comparison across a scoring_version boundary and writes no change row (AC5)", async () => {
    const fake = new FakeD1();
    const db = fake as unknown as D1Database;
    const priorRow = snapshotToRow("example.com", makeSnapshot({ timestamp: "2026-08-19T09:00:00.000Z" }));
    priorRow.scoring_version = "scoring-v0"; // simulate a model bump between observations
    await insertSnapshotRow(db, priorRow);
    const res = await recordAndCompare(db, makeSnapshot({ timestamp: "2026-08-19T10:00:00.000Z" }));
    expect(res.comparable).toBe(false);
    expect(res.reason).toBe("scoring model changed between observations");
    expect(res.scoreDelta).toBeNull();
    expect(fake.changes).toHaveLength(0);
    expect(fake.snapshots).toHaveLength(2); // the new observation is still stored
  });

  it("anchors only on prior COMPLETE snapshots (AC6)", async () => {
    const fake = new FakeD1();
    const db = fake as unknown as D1Database;
    // Seed a partial observation as the most recent prior — must be skipped.
    await insertSnapshotRow(db, snapshotToRow("example.com", makeSnapshot({ timestamp: "2026-08-19T09:30:00.000Z", tls: { probeError: "timeout" } })));
    // And an older complete one that the comparator SHOULD anchor on.
    await insertSnapshotRow(db, snapshotToRow("example.com", makeSnapshot({ timestamp: "2026-08-19T08:00:00.000Z" })));
    const res = await recordAndCompare(db, makeSnapshot({ timestamp: "2026-08-19T10:00:00.000Z" }));
    expect(res.comparable).toBe(true);
    expect(res.from?.scannedAt).toBe("2026-08-19T08:00:00.000Z");
    expect(fake.changes).toHaveLength(1);
  });

  it("degrades gracefully when storage throws (locked D1-failure decision)", async () => {
    const throwingDb = { prepare: () => { throw new Error("boom"); } } as unknown as D1Database;
    const res = await runSnapshotWithHistory(throwingDb, makeSnapshot());
    expect(res.comparable).toBe(false);
    expect(res.reason).toBe("history storage unavailable");
    expect(res.from).toBeNull();
    expect(res.to).toBeNull();
  });
});

describe("list read paths (AC7: indexed, summary-only, paginated)", () => {
  async function seed(fake: FakeD1) {
    const db = fake as unknown as D1Database;
    await insertSnapshotRow(db, snapshotToRow("example.com", makeSnapshot({ timestamp: "2026-08-19T08:00:00.000Z", verdict: { score: 90 } })));
    await insertSnapshotRow(db, snapshotToRow("example.com", makeSnapshot({ timestamp: "2026-08-19T09:00:00.000Z", verdict: { score: 80 } })));
    await insertSnapshotRow(db, snapshotToRow("example.com", makeSnapshot({ timestamp: "2026-08-19T10:00:00.000Z", verdict: { score: 70 } })));
    const [f, t] = fake.snapshots as Array<{ id: number }>;
    await insertChangeRow(db, {
      domain: "example.com",
      from_snapshot_id: f.id,
      to_snapshot_id: t.id,
      detected_at: "2026-08-19T09:00:01.000Z",
      comparable: 1,
      changed_fields: JSON.stringify([{ field: "verdict.score", from: 90, to: 80, materiality: "informational" }]),
      score_delta: -10,
      verdict_moved: 0,
    });
  }

  it("lists snapshots newest-first with summary columns only", async () => {
    const fake = new FakeD1();
    await seed(fake);
    const res = await listSnapshotHistory(fake as unknown as D1Database, "example.com", 10);
    expect(res.items).toHaveLength(3);
    expect(res.items[0].scannedAt).toBe("2026-08-19T10:00:00.000Z");
    expect(res.items[0].verdictScore).toBe(70);
    expect(res.nextBefore).toBeUndefined();
    // No raw payload leaks into the list view.
    expect(JSON.stringify(res.items)).not.toContain("raw_snapshot");
    expect(JSON.stringify(res.items)).not.toContain("redirectChain");
  });

  it("honors limit and the before cursor (stable pagination)", async () => {
    const fake = new FakeD1();
    await seed(fake);
    const db = fake as unknown as D1Database;
    const page1 = await listSnapshotHistory(db, "example.com", 2);
    expect(page1.items).toHaveLength(2);
    expect(page1.nextBefore).toBe("2026-08-19T09:00:00.000Z");
    const page2 = await listSnapshotHistory(db, "example.com", 2, page1.nextBefore);
    expect(page2.items.map((i) => i.scannedAt)).toEqual(["2026-08-19T08:00:00.000Z"]);
  });

  it("lists changes with mandatory provenance (from/to versions) and reason", async () => {
    const fake = new FakeD1();
    await seed(fake);
    const res = await listChangeHistory(fake as unknown as D1Database, "example.com", 10);
    expect(res.items).toHaveLength(1);
    const entry = res.items[0];
    expect(entry.comparable).toBe(true);
    expect(entry.reason).toBe("same scoring model");
    expect(entry.from.scoringVersion).toBe(SCORING_VERSION);
    expect(entry.to.scannerVersion).toBe(SCANNER_VERSION);
    expect(entry.changedFields[0].field).toBe("verdict.score");
    expect(entry.materiality).toBe("informational");
  });
});

describe("parseListLimit", () => {
  it("defaults to 10, clamps to 100, and rejects garbage", () => {
    expect(parseListLimit(undefined)).toBe(10);
    expect(parseListLimit("5")).toBe(5);
    expect(parseListLimit("500")).toBe(100);
    expect(parseListLimit("abc")).toBe(10);
    expect(parseListLimit("0")).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Route-level: /history and /changes through the Hono app
// ---------------------------------------------------------------------------

describe("GET /history and GET /changes routes", () => {
  it("400s when domain is missing", async () => {
    const env = makeEnv(new FakeD1());
    const res = await app.request("/history", undefined, env);
    expect(res.status).toBe(400);
    const res2 = await app.request("/changes", undefined, env);
    expect(res2.status).toBe(400);
  });

  it("returns the seeded history with the API envelope", async () => {
    const fake = new FakeD1();
    await insertSnapshotRow(fake as unknown as D1Database, snapshotToRow("example.com", makeSnapshot()));
    const env = makeEnv(fake);
    const res = await app.request("/history?domain=example.com", undefined, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { domain: string; snapshots: Array<Record<string, unknown>> };
    expect(body.domain).toBe("example.com");
    expect(body.snapshots).toHaveLength(1);
    expect(body.snapshots[0].scannerVersion).toBe(SCANNER_VERSION);
    expect(body.snapshots[0]).not.toHaveProperty("raw_snapshot");
  });

  it("returns change entries with provenance", async () => {
    const fake = new FakeD1();
    const db = fake as unknown as D1Database;
    const f = await insertSnapshotRow(db, snapshotToRow("example.com", makeSnapshot({ timestamp: "2026-08-19T08:00:00.000Z" })));
    const t = await insertSnapshotRow(db, snapshotToRow("example.com", makeSnapshot({ timestamp: "2026-08-19T09:00:00.000Z" })));
    await insertChangeRow(db, {
      domain: "example.com",
      from_snapshot_id: f,
      to_snapshot_id: t,
      detected_at: "2026-08-19T09:00:01.000Z",
      comparable: 1,
      changed_fields: JSON.stringify([{ field: "http.status", from: 200, to: 500, materiality: "material" }]),
      score_delta: -20,
      verdict_moved: 1,
    });
    const env = makeEnv(fake);
    const res = await app.request("/changes?domain=example.com", undefined, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { changes: Array<{ comparable: boolean; reason: string; from: { scoringVersion: string } }> };
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0].comparable).toBe(true);
    expect(body.changes[0].reason).toBe("same scoring model");
    expect(body.changes[0].from.scoringVersion).toBe(SCORING_VERSION);
  });

  it("is rate-limited on the DISCOVERY bucket", async () => {
    const env = makeEnv(new FakeD1(), {
      DISCOVERY_RATE_LIMITER: { limit: async () => ({ success: false }) },
    });
    const res = await app.request("/history?domain=example.com", undefined, env);
    expect(res.status).toBe(429);
  });

  it("does not bypass the payment gate on /snapshot/run (history param changes nothing pre-payment)", async () => {
    const env = makeEnv(new FakeD1());
    const res = await app.request("/snapshot/run?url=https://example.com&history=true", undefined, env);
    expect(res.status).toBe(402);
    const res2 = await app.request("/snapshot/run?url=https://example.com&history=yes", undefined, env);
    expect(res2.status).toBe(402);
  });
});

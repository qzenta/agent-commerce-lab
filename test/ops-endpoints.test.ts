import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import { insertSnapshotRow, snapshotToRow } from "../src/history";
import type { SecuritySnapshot } from "../src/snapshot";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSnapshotWithContent(overrides: Record<string, unknown> = {}): SecuritySnapshot {
  const base: SecuritySnapshot = {
    target: "https://fixture.example/",
    timestamp: "2026-08-20T12:00:00.000Z",
    http: { status: 200, ok: true, redirectChain: ["https://fixture.example/"], finalUrl: "https://fixture.example/", error: null },
    tls: { usedHttps: true, protocol: "TLS 1.3", cipherSuite: "TLS_AES_128_GCM_SHA256", cipherSuiteId: "0x1301", weakCipher: false, probeError: null },
    dns: { hasA: true, hasAAAA: false, hasMX: false, hasTXT: false, records: { A: ["93.184.216.34"], AAAA: [], MX: [], TXT: [] }, note: "resolved via Cloudflare DNS-over-HTTPS (1.1.1.1)" },
    securityHeaders: {
      strictTransportSecurity: "max-age=31536000; includeSubDomains",
      contentSecurityPolicy: "default-src 'self'; frame-ancestors 'self'",
      xFrameOptions: "DENY",
      xContentTypeOptions: "nosniff",
      referrerPolicy: "strict-origin-when-cross-origin",
      permissionsPolicy: "geolocation=()",
    },
    headerScore: { score: 95, grade: "A", issues: [] },
    techObservations: { server: "nginx", poweredBy: null, poweredByCloudflare: false, cmsGuess: null },
    findings: [],
    verdict: { status: "FAIL", score: 35, summary: "content FAIL", topIssues: ["[critical] UIF ceiling wrong"] },
    content: {
      scope: { pagesScanned: 3, pagesPlanned: 4, sitemapFound: true, truncated: false },
      facts: {
        "za.uif.monthly_ceiling_zar": { claims: ["1476"], pages: ["/"], impact: "money" },
      },
      findings: [
        {
          type: "figure-mismatch",
          factKey: "za.uif.monthly_ceiling_zar",
          severity: "critical",
          confidence: "high",
          pagePath: "/",
          claim: "1476",
          groundTruth: "17712",
          supersededBy: null,
          message: "UIF ceiling stated as 1476; approved value is 17712.",
        },
      ],
      score: 10,
      grade: "F",
      status: "FAIL",
    },
    ...overrides,
  };
  return base;
}

type Row = Record<string, unknown>;

class FakeOpsD1 {
  snapshots: Row[] = [];
  alerts: Row[] = [];
  reviews: Row[] = [];
  changes: Row[] = [];
  private nextId = { s: 1, a: 1, r: 1, c: 1 };

  prepare(sql: string) {
    const s = sql.replace(/\s+/g, " ").trim();

    if (s.startsWith("INSERT INTO snapshots")) {
      const cols = s.match(/INSERT INTO snapshots \(([^)]+)\)/)![1].split(",").map((c) => c.trim());
      return {
        bind: (...values: unknown[]) => ({
          run: async () => {
            const row: Row = { id: this.nextId.s++ };
            cols.forEach((c, i) => (row[c] = values[i]));
            this.snapshots.push(row);
            return { meta: { last_row_id: row.id, changes: 1 } };
          },
        }),
      };
    }
    if (s.startsWith("INSERT INTO findings_review")) {
      const cols = s.match(/INSERT INTO findings_review \(([^)]+)\)/)![1].split(",").map((c) => c.trim());
      return {
        bind: (...values: unknown[]) => ({
          run: async () => {
            const row: Row = { id: this.nextId.r++ };
            cols.forEach((c, i) => (row[c] = values[i]));
            this.reviews.push(row);
            return { meta: { last_row_id: row.id, changes: 1 } };
          },
        }),
      };
    }
    if (s.startsWith("UPDATE findings_review")) {
      return {
        bind: (...values: unknown[]) => ({
          run: async () => {
            const [domain, key, status, ruledBy, ruledAt, notes] = values as [string, string, string, string, string, string | null];
            const row = this.reviews.find((r) => r.domain === domain && r.finding_key === key)!;
            row.status = status;
            row.ruled_by = ruledBy;
            row.ruled_at = ruledAt;
            row.notes = notes;
            return { meta: { changes: 1 } };
          },
        }),
      };
    }
    if (s.includes("raw_snapshot FROM snapshots")) {
      return {
        bind: (...values: unknown[]) => ({
          first: async () => {
            const domain = values[0] as string;
            return this.snapshots.filter((r) => r.domain === domain && r.status === "complete").sort((a, b) => String(b.scanned_at).localeCompare(String(a.scanned_at)))[0] ?? null;
          },
        }),
      };
    }
    if (s.includes("FROM snapshots") && s.includes("ORDER BY scanned_at DESC")) {
      return {
        bind: (...values: unknown[]) => ({
          all: async () => {
            const domain = values[0] as string;
            return { results: this.snapshots.filter((r) => r.domain === domain).sort((a, b) => String(b.scanned_at).localeCompare(String(a.scanned_at))) };
          },
        }),
      };
    }
    if (s.includes("JOIN snapshots f")) {
      return {
        bind: () => ({ all: async () => ({ results: this.changes }) }),
      };
    }
    if (s.includes("FROM alerts")) {
      return {
        bind: (...values: unknown[]) => ({
          all: async () => {
            const domain = values[0] as string;
            return { results: this.alerts.filter((r) => r.domain === domain).sort((a, b) => String(b.detected_at).localeCompare(String(a.detected_at))) };
          },
        }),
      };
    }
    if (s.includes("SELECT id FROM findings_review")) {
      return {
        bind: (...values: unknown[]) => ({
          first: async () => this.reviews.find((r) => r.domain === values[0] && r.finding_key === values[1]) ?? null,
        }),
      };
    }
    if (s.includes("FROM findings_review")) {
      return {
        bind: (...values: unknown[]) => ({
          all: async () => ({ results: this.reviews.filter((r) => r.domain === values[0]) }),
        }),
      };
    }
    throw new Error("fake D1 (ops): unhandled SQL: " + s);
  }
}

const TEST_PAY_TO = "0x1866Fd80B1196AcC70A98a50917A8FD4639FE823";

function makeEnv(fake: FakeOpsD1) {
  return {
    X402_NETWORK: "base-sepolia",
    X402_PAY_TO: TEST_PAY_TO,
    DISCOVERY_RATE_LIMITER: { limit: async () => ({ success: true }) },
    SNAPSHOT_RATE_LIMITER: { limit: async () => ({ success: true }) },
    HISTORY_DB: fake,
  } as unknown as Parameters<typeof app.request>[2];
}

describe("pilot ops endpoints (P0)", () => {
  it("GET /alerts returns recorded alerts for a domain", async () => {
    const fake = new FakeOpsD1();
    fake.alerts.push({ id: 1, domain: "fixture.example", detected_at: "2026-08-20T12:00:00.000Z", change_id: 1, materiality: "critical", verdict_moved: 1, summary: "s", delivered_at: null, delivery_error: null });
    const res = await app.request("/alerts?domain=fixture.example", undefined, makeEnv(fake));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alerts: Array<{ materiality: string }> };
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0].materiality).toBe("critical");
  });

  it("GET /alerts 400s without a domain and 429s on the rate limit", async () => {
    const fake = new FakeOpsD1();
    expect((await app.request("/alerts", undefined, makeEnv(fake))).status).toBe(400);
    const limited = makeEnv(new FakeOpsD1());
    (limited as { DISCOVERY_RATE_LIMITER: { limit: () => Promise<{ success: boolean }> } }).DISCOVERY_RATE_LIMITER = { limit: async () => ({ success: false }) };
    expect((await app.request("/alerts?domain=x.com", undefined, limited)).status).toBe(429);
  });

  it("GET /report renders a Markdown digest from a stored snapshot", async () => {
    const fake = new FakeOpsD1();
    await insertSnapshotRow(fake as unknown as D1Database, snapshotToRow("fixture.example", makeSnapshotWithContent()));
    const res = await app.request("/report?domain=fixture.example", undefined, makeEnv(fake));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const md = await res.text();
    expect(md).toContain("# SiteHealth Passport — fixture.example");
    expect(md).toContain("Verdict: **FAIL**");
    expect(md).toContain("Content accuracy: **FAIL**");
    expect(md).toContain("figure-mismatch | za.uif.monthly_ceiling_zar");
  });

  it("GET /findings lists content findings with pending review status, then records a ruling", async () => {
    const fake = new FakeOpsD1();
    await insertSnapshotRow(fake as unknown as D1Database, snapshotToRow("fixture.example", makeSnapshotWithContent()));
    const env = makeEnv(fake);

    const list = await app.request("/findings?domain=fixture.example", undefined, env);
    expect(list.status).toBe(200);
    const listed = (await list.json()) as { findings: Array<{ findingKey: string; review: { status: string } }> };
    expect(listed.findings).toHaveLength(1);
    expect(listed.findings[0].findingKey).toBe("figure-mismatch:za.uif.monthly_ceiling_zar");
    expect(listed.findings[0].review.status).toBe("pending");

    const bad = await app.request(
      "/findings/review",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain: "fixture.example", findingKey: "figure-mismatch:za.uif.monthly_ceiling_zar", status: "maybe" }) },
      env
    );
    expect(bad.status).toBe(400);

    const ok = await app.request(
      "/findings/review",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain: "fixture.example", findingKey: "figure-mismatch:za.uif.monthly_ceiling_zar", status: "confirmed", notes: "verified against SARS source" }) },
      env
    );
    expect(ok.status).toBe(200);

    const relisted = (await (await app.request("/findings?domain=fixture.example", undefined, env)).json()) as { findings: Array<{ review: { status: string; ruled_by: string | null } }> };
    expect(relisted.findings[0].review.status).toBe("confirmed");
    expect(relisted.findings[0].review.ruled_by).toBe("reviewer");

    const dup = await app.request(
      "/findings/review",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain: "fixture.example", findingKey: "figure-mismatch:za.uif.monthly_ceiling_zar", status: "false-positive" }) },
      env
    );
    expect(dup.status).toBe(200);
    const final = (await (await app.request("/findings?domain=fixture.example", undefined, env)).json()) as { findings: Array<{ review: { status: string } }> };
    expect(final.findings[0].review.status).toBe("false-positive"); // upsert, not duplicate
    expect(fake.reviews).toHaveLength(1);
  });

  it("GET /findings handles a domain with no content scan", async () => {
    const fake = new FakeOpsD1();
    const res = await app.request("/findings?domain=noscan.example", undefined, makeEnv(fake));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { findings: unknown[] };
    expect(body.findings).toEqual([]);
  });
});

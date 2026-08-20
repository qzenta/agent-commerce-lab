import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { runSecuritySnapshot } from "../src/snapshot";
import { ZA_COMPLIANCE_FACTS, ZA_COMPLIANCE_PATTERNS } from "../ground-truth/za-compliance";

describe("runSecuritySnapshot SSRF guard integration", () => {
  it("rejects a cloud metadata IP literal without fetching it", async () => {
    const result = await runSecuritySnapshot("http://169.254.169.254/latest/meta-data/");
    expect(result.http.error).toMatch(/blocked by SSRF guard/);
    expect(result.findings.join(" ")).toMatch(/blocked by SSRF guard/);
  });

  it("rejects an RFC1918 private IP literal", async () => {
    const result = await runSecuritySnapshot("http://10.0.0.5/");
    expect(result.http.error).toMatch(/blocked by SSRF guard/);
  });

  it("rejects localhost", async () => {
    const result = await runSecuritySnapshot("http://localhost:8080/");
    expect(result.http.error).toMatch(/blocked by SSRF guard/);
  });

  it("allows a legitimate public URL through to the fetch layer", async () => {
    const result = await runSecuritySnapshot("https://example.com");
    expect(result.http.error === null || !result.http.error.includes("blocked by SSRF guard")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// v2 integration: content=true through the real pipeline (AC2 + AC5)
// ---------------------------------------------------------------------------

/**
 * Minimal ground-truth D1 fake: serves the approved UIF fact + its patterns from
 * the SELECTs the Worker issues (active facts, superseded facts, patterns).
 */
class GroundTruthFakeD1 {
  prepare(_sql: string) {
    const uif = ZA_COMPLIANCE_FACTS.find((f) => f.factKey === "za.uif.monthly_ceiling_zar")!;
    const patterns = ZA_COMPLIANCE_PATTERNS.filter((p) => p.factKey === uif.factKey);
    return {
      bind: () => ({
        all: async () => {
          // Distinguish the three SELECT shapes by the SQL text.
          if (_sql.includes("fact_patterns")) {
            return {
              results: patterns.map((p) => ({ factKey: p.factKey, kind: p.kind, pattern: p.pattern, priority: p.priority })),
            };
          }
          if (_sql.includes("applies_until IS NOT NULL")) {
            return { results: [] }; // no superseded rows seeded in P0
          }
          return {
            results: [
              {
                factKey: uif.factKey,
                label: uif.label,
                value: uif.value,
                unit: uif.unit,
                jurisdiction: uif.jurisdiction,
                impactClass: uif.impactClass,
                appliesFrom: uif.appliesFrom,
                appliesUntil: null,
                sourceTier: uif.sourceTier,
                sourceRef: uif.sourceRef,
                approvedBy: uif.approvedBy,
                approvedAt: uif.approvedAt,
                notes: uif.notes ?? null,
              },
            ],
          };
        },
      }),
    };
  }
}

function targetResponse(status = 200, body = "ok"): Response {
  return new Response(`<html><head></head><body>${body}</body></html>`, {
    status,
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

function dohResponse(): Response {
  return new Response(JSON.stringify({ Answer: [{ type: 1, data: "93.184.216.34" }] }), { status: 200 });
}

describe("runSecuritySnapshot content=true integration", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  /** Full fetch stub: DoH lookups + target + sitemap + content pages. */
  function makeFetchStub(opts?: { wrongUif?: boolean }) {
    const wrongUif = opts?.wrongUif ?? false;
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.hostname === "1.1.1.1") {
        const type = url.searchParams.get("type") ?? "";
        return type === "A"
          ? new Response(JSON.stringify({ Answer: [{ type: 1, data: "93.184.216.34" }] }), { status: 200 })
          : new Response(JSON.stringify({ Answer: [] }), { status: 200 });
      }
      if (url.pathname === "/sitemap.xml") return new Response("not found", { status: 404 });
      if (url.pathname === "/") return targetResponse(200, '<a href="/calculator">calc</a>');
      if (url.pathname === "/calculator" && wrongUif) return targetResponse(200, "UIF is capped at R1 476 per month.");
      if (url.pathname === "/calculator") return targetResponse(200, "UIF ceiling is R17,712.");
      return targetResponse();
    });
    return fetchFn;
  }

  /** Snapshot JSON with the timestamp normalized so two runs can be compared. */
  function stripTimestamp(snapshot: unknown): string {
    const clone = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
    delete clone.timestamp;
    return JSON.stringify(clone);
  }

  it("attaches the content block, flags the wrong UIF figure (D4 cap -> content FAIL -> verdict FAIL)", async () => {
    vi.stubGlobal("fetch", makeFetchStub({ wrongUif: true }));
    const result = await runSecuritySnapshot("https://fixture.example/", {
      content: true,
      groundTruthDb: new GroundTruthFakeD1() as unknown as D1Database,
    });

    // AC2: the wrong figure on /calculator is caught with correct severity + confidence.
    expect(result.content).toBeDefined();
    const mismatch = result.content!.findings.find((f) => f.type === "figure-mismatch" && f.factKey === "za.uif.monthly_ceiling_zar");
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe("critical");
    expect(mismatch!.confidence).toBe("high");
    expect(mismatch!.claim).toBe("1476");
    expect(mismatch!.groundTruth).toBe("17712");

    // AC5 (D4): critical money finding -> content.score 35 -> dimension FAIL -> verdict FAIL,
    // even though the security side is clean.
    expect(result.content!.score).toBe(35);
    expect(result.content!.status).toBe("FAIL");
    expect(result.verdict.status).toBe("FAIL");
    expect(result.verdict.score).toBeLessThanOrEqual(35);
    expect(result.verdict.topIssues.some((i) => i.includes("[critical]"))).toBe(true);

    // Deterministic scope bookkeeping: target + /calculator via link fallback.
    expect(result.content!.scope.pagesScanned).toBe(2);
    expect(result.content!.scope.sitemapFound).toBe(false);
  });

  it("is byte-identical to the v1 path when content is not requested (AC6)", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const withContent = await runSecuritySnapshot("https://fixture.example/", {
      content: false,
      groundTruthDb: new GroundTruthFakeD1() as unknown as D1Database,
    });
    const without = await runSecuritySnapshot("https://fixture.example/");
    expect(withContent.content).toBeUndefined();
    // Compare with timestamp normalized (the two scans run at different instants).
    expect(stripTimestamp(withContent)).toBe(stripTimestamp(without));
  });

  it("degrades loudly (finding note, no crash) when the ground-truth store is unavailable", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const throwingDb = { prepare: () => { throw new Error("boom"); } } as unknown as D1Database;
    const result = await runSecuritySnapshot("https://fixture.example/", {
      content: true,
      groundTruthDb: throwingDb,
    });
    expect(result.content).toBeUndefined();
    expect(result.findings.join(" ")).toMatch(/Content scan skipped/);
    expect(result.verdict.status).toBe("PASS"); // security side unaffected
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  normalizeMoney,
  normalizeMonthDay,
  htmlToText,
  extractClaimsFromText,
  extractInternalLinks,
  parseSitemapUrls,
  classifyPages,
  scoreContent,
  runContentCheck,
  CONTENT_MAX_PAGES,
  type ContentFinding,
} from "../src/content-check";
import type { GroundTruthFact, FactPattern } from "../src/ground-truth";
import { ZA_COMPLIANCE_FACTS, ZA_COMPLIANCE_PATTERNS } from "../ground-truth/za-compliance";

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

describe("normalizeMoney", () => {
  it("handles the ZA format zoo deterministically", () => {
    expect(normalizeMoney("R2.3m")).toBe("2300000");
    expect(normalizeMoney("R 2,3 million")).toBe("2300000");
    expect(normalizeMoney("R2,300,000")).toBe("2300000");
    expect(normalizeMoney("R2 300 000")).toBe("2300000");
    expect(normalizeMoney("R2.3 million")).toBe("2300000");
    expect(normalizeMoney("R120 000")).toBe("120000");
    expect(normalizeMoney("R120,000")).toBe("120000");
    expect(normalizeMoney("R120k")).toBe("120000");
    expect(normalizeMoney("R17 712")).toBe("17712");
    expect(normalizeMoney("R17,712")).toBe("17712");
    expect(normalizeMoney("R1 476")).toBe("1476");
    expect(normalizeMoney("R1 000 000")).toBe("1000000");
  });

  it("returns null for non-money expressions", () => {
    expect(normalizeMoney("not money")).toBeNull();
    expect(normalizeMoney("12")).toBe("12"); // bare number is still a number
    expect(normalizeMoney("$5")).toBeNull();
  });
});

describe("normalizeMonthDay", () => {
  it("handles day-first, day-with-suffix, and month-first forms", () => {
    expect(normalizeMonthDay("30 June")).toBe("06-30");
    expect(normalizeMonthDay("30th June")).toBe("06-30");
    expect(normalizeMonthDay("30 June 2026")).toBe("06-30");
    expect(normalizeMonthDay("June 30")).toBe("06-30");
    expect(normalizeMonthDay("31 May")).toBe("05-31");
    expect(normalizeMonthDay("31st of March")).toBe("03-31");
  });

  it("returns null for non-date expressions", () => {
    expect(normalizeMonthDay("thirty june")).toBeNull();
    expect(normalizeMonthDay("30")).toBeNull();
    expect(normalizeMonthDay("2026-08-20")).toBeNull();
  });
});

describe("htmlToText", () => {
  it("strips scripts/styles/tags and collapses whitespace", () => {
    const html =
      '<html><script>var x=1;</script><style>.a{color:red}</style><body><p>R2.3m &amp; more</p><a href="/x">link</a></body></html>';
    const text = htmlToText(html);
    expect(text).toContain("R2.3m");
    expect(text).toContain("&");
    expect(text).not.toContain("<");
    expect(text).not.toContain("var x");
    expect(text).not.toContain(".a{");
  });
});

// ---------------------------------------------------------------------------
// Claim extraction
// ---------------------------------------------------------------------------

const UIF = ZA_COMPLIANCE_FACTS.find((f) => f.factKey === "za.uif.monthly_ceiling_zar")!;
const UIF_PATTERNS = ZA_COMPLIANCE_PATTERNS.filter((p) => p.factKey === UIF.factKey);

describe("extractClaimsFromText", () => {
  it("extracts a correct UIF ceiling via the value pattern", () => {
    const claims = extractClaimsFromText("Our calculator uses the R17,712 UIF ceiling.", "/", [UIF], UIF_PATTERNS);
    expect(claims.map((c) => c.normalized)).toContain("17712");
  });

  it("extracts a wrong figure via the context pattern (UIF keyword window)", () => {
    const claims = extractClaimsFromText("UIF is capped at R1 476 per month.", "/", [UIF], UIF_PATTERNS);
    expect(claims.map((c) => c.normalized)).toContain("1476");
  });

  it("ignores keyword rows (they are topic markers, not claims)", () => {
    const claims = extractClaimsFromText("UIF", "/", [UIF], UIF_PATTERNS);
    expect(claims).toHaveLength(0);
  });

  it("does not extract a figure without the topic context (no false match)", () => {
    const claims = extractClaimsFromText("Interest accrues on R1 476 of the balance.", "/", [UIF], UIF_PATTERNS);
    expect(claims).toHaveLength(0);
  });

  it("is deterministic across runs", () => {
    const text = "VAT registration is compulsory above R2.3m since April 2026.";
    const VAT = ZA_COMPLIANCE_FACTS.find((f) => f.factKey === "za.vat.mandatory_threshold_zar")!;
    const PATS = ZA_COMPLIANCE_PATTERNS.filter((p) => p.factKey === VAT.factKey);
    const a = extractClaimsFromText(text, "/", [VAT], PATS);
    const b = extractClaimsFromText(text, "/", [VAT], PATS);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("parseSitemapUrls / extractInternalLinks", () => {
  it("parses sitemap locs, same-origin only", () => {
    const origin = new URL("https://example.com/");
    const urls = parseSitemapUrls(
      '<urlset><url><loc>https://example.com/</loc></url><url><loc>https://example.com/vat</loc></url><url><loc>https://other.com/x</loc></url></urlset>',
      origin
    );
    expect(urls).toEqual(["https://example.com/", "https://example.com/vat"]);
  });

  it("resolves relative internal links against the origin and filters foreign hosts", () => {
    const links = extractInternalLinks(
      '<a href="/vat">v</a><a href="https://example.com/roe">r</a><a href="https://evil.com/x">e</a><a href="mailto:a@b.c">m</a>',
      new URL("https://example.com/")
    );
    expect(links).toEqual(["https://example.com/vat", "https://example.com/roe"]);
  });
});

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function page(path: string, text: string) {
  return { pagePath: path, text, claims: extractClaimsFromText(text, path, [UIF], UIF_PATTERNS) };
}

describe("classifyPages (UIF money fact)", () => {
  const noSuperseded: GroundTruthFact[] = [];

  it("reports a wrong UIF ceiling as a critical figure-mismatch (money impact)", () => {
    const { findings } = classifyPages(
      [page("/calculator", "UIF is capped at R1 476 per month.")],
      [UIF],
      noSuperseded,
      UIF_PATTERNS,
      "2026-08-20"
    );
    const f = findings.find((x) => x.type === "figure-mismatch")!;
    expect(f.factKey).toBe("za.uif.monthly_ceiling_zar");
    expect(f.severity).toBe("critical");
    expect(f.claim).toBe("1476");
    expect(f.groundTruth).toBe("17712");
    expect(f.confidence).toBe("high");
    expect(f.pagePath).toBe("/calculator");
  });

  it("is clean when the page states the correct ceiling", () => {
    const { findings } = classifyPages([page("/calculator", "UIF ceiling is R17,712.")], [UIF], noSuperseded, UIF_PATTERNS, "2026-08-20");
    expect(findings).toHaveLength(0);
  });

  it("detects a cross-page contradiction when two pages disagree (critical, money)", () => {
    const { findings } = classifyPages(
      [page("/faq", "UIF is capped at R17,712."), page("/blog", "UIF is capped at R1 476.")],
      [UIF],
      noSuperseded,
      UIF_PATTERNS,
      "2026-08-20"
    );
    const c = findings.find((x) => x.type === "cross-page-contradiction")!;
    expect(c.severity).toBe("critical");
    expect(c.pagePath).toBeNull();
  });

  it("reports absent-required-figure (informational) when the topic appears without a figure", () => {
    const { findings } = classifyPages(
      [page("/pricing", "Our payroll service handles all UIF contributions for you.")],
      [UIF],
      noSuperseded,
      UIF_PATTERNS,
      "2026-08-20"
    );
    expect(findings.some((f) => f.type === "absent-required-figure" && f.severity === "informational")).toBe(true);
  });

  it("does not fire absent-required for compliance-threshold facts (VAT)", () => {
    const VAT = ZA_COMPLIANCE_FACTS.find((f) => f.factKey === "za.vat.mandatory_threshold_zar")!;
    const PATS = ZA_COMPLIANCE_PATTERNS.filter((p) => p.factKey === VAT.factKey);
    const p = { pagePath: "/", text: "We help with all your VAT registration needs.", claims: [] };
    const { findings } = classifyPages([p], [VAT], [], PATS, "2026-08-20");
    expect(findings.some((f) => f.type === "absent-required-figure")).toBe(false);
  });
});

describe("classifyPages figure-stale (with a superseded row)", () => {
  it("classifies a claim matching a superseded value as figure-stale", () => {
    const supersededRow: GroundTruthFact = {
      ...UIF,
      factKey: "za.test.old_ceiling",
      value: "1476",
      appliesUntil: "2026-03-31",
    };
    const current: GroundTruthFact = {
      ...UIF,
      factKey: "za.test.old_ceiling",
      value: "17712",
      appliesFrom: "2026-04-01",
      appliesUntil: null,
    };
    const patterns: FactPattern[] = [
      { factKey: "za.test.old_ceiling", kind: "context", pattern: "(?:UIF)[^.]{0,140}?R\\s*(\\d[\\d\\s.,]*)", priority: 5 },
      { factKey: "za.test.old_ceiling", kind: "keyword", pattern: "\\bUIF\\b", priority: 1 },
    ];
    const p = {
      pagePath: "/blog",
      text: "UIF is capped at R1 476 per month.",
      claims: extractClaimsFromText("UIF is capped at R1 476 per month.", "/blog", [current], patterns),
    };
    const { findings } = classifyPages([p], [current], [supersededRow], patterns, "2026-08-20");
    const stale = findings.find((x) => x.type === "figure-stale")!;
    expect(stale.claim).toBe("1476");
    expect(stale.supersededBy).toBe("17712");
    expect(stale.severity).toBe("critical"); // money impact
  });
});

// ---------------------------------------------------------------------------
// Scoring + Gate 1 D4 hard cap
// ---------------------------------------------------------------------------

function finding(overrides: Partial<ContentFinding>): ContentFinding {
  return {
    type: "figure-mismatch",
    factKey: "za.uif.monthly_ceiling_zar",
    severity: "critical",
    confidence: "high",
    pagePath: "/",
    claim: "1476",
    groundTruth: "17712",
    supersededBy: null,
    message: "x",
    ...overrides,
  };
}

describe("scoreContent", () => {
  it("starts at 100 and deducts by severity", () => {
    expect(scoreContent([UIF], []).score).toBe(100);
    expect(scoreContent([UIF], [finding({ severity: "material" })]).score).toBe(85);
    expect(scoreContent([UIF], [finding({ severity: "informational" })]).score).toBe(95);
  });

  it("applies the D4 hard cap: critical money/deadline finding caps score at 35 even with one deduction", () => {
    const r = scoreContent([UIF], [finding({ severity: "critical" })]);
    expect(r.score).toBe(35); // 100 - 30 = 70, capped to 35
    expect(r.status).toBe("FAIL");
  });

  it("caps regardless of how many other findings would otherwise leave a healthy score", () => {
    // One critical money finding plus informational noise: cap still binds at 35.
    const r = scoreContent([UIF], [finding({ severity: "critical" }), finding({ severity: "informational" })]);
    expect(r.score).toBe(35);
    expect(r.status).toBe("FAIL");
  });

  it("does NOT cap for a critical finding on a non-money/deadline fact (e.g. compliance-threshold)", () => {
    const VAT = ZA_COMPLIANCE_FACTS.find((f) => f.factKey === "za.vat.mandatory_threshold_zar")!;
    const r = scoreContent([VAT], [finding({ factKey: "za.vat.mandatory_threshold_zar", severity: "critical" })]);
    expect(r.score).toBe(70); // 100 - 30; no D4 cap because impact is compliance-threshold
  });

  it("status rule: material findings force WARN, not PASS", () => {
    const r = scoreContent([UIF], [finding({ severity: "material" })]);
    expect(r.score).toBe(85);
    expect(r.status).toBe("WARN");
  });

  it("PASS requires no material-or-worse findings", () => {
    expect(scoreContent([UIF], []).status).toBe("PASS");
    expect(scoreContent([UIF], [finding({ severity: "informational" })]).status).toBe("PASS");
  });

  it("a wrong VAT threshold (compliance-threshold, material) scores WARN, never FAIL", () => {
    const VAT = ZA_COMPLIANCE_FACTS.find((f) => f.factKey === "za.vat.mandatory_threshold_zar")!;
    const r = scoreContent([VAT], [finding({ factKey: VAT.factKey, severity: "material" })]);
    expect(r.status).toBe("WARN");
  });
});

// ---------------------------------------------------------------------------
// runContentCheck orchestration (injected fetch)
// ---------------------------------------------------------------------------

function htmlPage(body: string): Response {
  return new Response(`<html><body>${body}</body></html>`, { status: 200 });
}

const SITEMAP = `<urlset>
  <url><loc>https://fixture.example/</loc></url>
  <url><loc>https://fixture.example/calculator</loc></url>
  <url><loc>https://fixture.example/faq</loc></url>
  <url><loc>https://evil.example/</loc></url>
</urlset>`;

describe("runContentCheck", () => {
  it("crawls sitemap pages (same-origin), extracts and flags a wrong UIF figure, truncated=false", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/sitemap.xml") return htmlPage(SITEMAP);
      if (url.pathname === "/calculator") return htmlPage("UIF is capped at R1 476 per month.");
      if (url.pathname === "/faq") return htmlPage("UIF ceiling is R17,712.");
      return htmlPage("home");
    });
    const result = await runContentCheck({
      originUrl: "https://fixture.example/",
      fetchFn,
      facts: [UIF],
      superseded: [],
      patterns: UIF_PATTERNS,
      asOf: "2026-08-20",
    });
    expect(result.scope.sitemapFound).toBe(true);
    expect(result.scope.pagesScanned).toBe(4); // target + /calculator + /faq (+ "/" from sitemap)
    expect(result.scope.pagesPlanned).toBe(4);
    expect(result.scope.truncated).toBe(false);
    expect(result.findings.some((f) => f.type === "figure-mismatch" && f.severity === "critical")).toBe(true);
    // D4 cap through the full pipeline.
    expect(result.score).toBe(35);
    expect(result.status).toBe("FAIL");
  });

  it("respects the page cap and reports truncation", async () => {
    const many = Array.from({ length: 30 }, (_, i) => `<url><loc>https://fixture.example/p${i}</loc></url>`).join("");
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/sitemap.xml") return htmlPage(`<urlset>${many}</urlset>`);
      return htmlPage("ok");
    });
    const result = await runContentCheck({
      originUrl: "https://fixture.example/",
      fetchFn,
      facts: [UIF],
      superseded: [],
      patterns: UIF_PATTERNS,
      maxPages: 4,
      asOf: "2026-08-20",
    });
    expect(result.scope.pagesPlanned).toBe(4);
    expect(result.scope.pagesScanned).toBe(4);
    expect(result.scope.truncated).toBe(true);
  });

  it("falls back to internal links when no sitemap exists", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/sitemap.xml") return new Response("not found", { status: 404 });
      if (url.pathname === "/") return htmlPage('<a href="/calculator">calc</a><a href="https://evil.example/x">x</a>');
      if (url.pathname === "/calculator") return htmlPage("UIF capped at R17,712.");
      return htmlPage("home");
    });
    const result = await runContentCheck({
      originUrl: "https://fixture.example/",
      fetchFn,
      facts: [UIF],
      superseded: [],
      patterns: UIF_PATTERNS,
      asOf: "2026-08-20",
    });
    expect(result.scope.sitemapFound).toBe(false);
    expect(result.scope.pagesScanned).toBe(2);
    expect(result.findings).toHaveLength(0); // both pages correct
  });

  it("reports FAIL (score 0) when no page could be read", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await runContentCheck({
      originUrl: "https://fixture.example/",
      fetchFn,
      facts: [UIF],
      superseded: [],
      patterns: UIF_PATTERNS,
      asOf: "2026-08-20",
    });
    expect(result.scope.pagesScanned).toBe(0);
    expect(result.score).toBe(0);
    expect(result.status).toBe("FAIL");
  });

  it("is deterministic across two identical runs", async () => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/sitemap.xml") return htmlPage(SITEMAP);
      if (url.pathname === "/calculator") return htmlPage("UIF is capped at R1 476 per month.");
      if (url.pathname === "/faq") return htmlPage("UIF ceiling is R17,712.");
      return htmlPage("home");
    });
    const input = {
      originUrl: "https://fixture.example/",
      fetchFn,
      facts: [UIF],
      superseded: [],
      patterns: UIF_PATTERNS,
      asOf: "2026-08-20",
    };
    const a = await runContentCheck(input);
    const b = await runContentCheck(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("CONTENT_MAX_PAGES defaults to 10 (Gate 1 ruling D2)", () => {
    expect(CONTENT_MAX_PAGES).toBe(10);
  });
});

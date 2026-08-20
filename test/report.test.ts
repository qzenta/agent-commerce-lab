import { describe, expect, it } from "vitest";
import { buildDigest, type DigestInput } from "../src/report";
import type { ChangeEntry } from "../src/history";

function input(overrides: Partial<DigestInput> = {}): DigestInput {
  return {
    domain: "fixture.example",
    generatedAt: "2026-08-20T12:00:00.000Z",
    latest: {
      snapshotId: 2,
      domain: "fixture.example",
      scannedAt: "2026-08-20T12:00:00.000Z",
      scannerVersion: "snapshot-v2",
      scoringVersion: "scoring-v2",
      status: "complete",
      httpStatus: 200,
      usedHttps: true,
      tlsProtocol: "TLS 1.3",
      weakCipher: false,
      headerScore: 95,
      headerGrade: "A",
      verdictStatus: "FAIL",
      verdictScore: 35,
      contentScore: 10,
      contentGrade: "F",
      contentStatus: "FAIL",
      contentPagesScanned: 3,
    },
    content: {
      score: 10,
      grade: "F",
      status: "FAIL",
      scope: { pagesScanned: 3, pagesPlanned: 4, sitemapFound: true, truncated: false },
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
          message: "UIF ceiling stated as 1476; approved 17712.",
        },
      ],
    },
    changes: [
      {
        changeId: 1,
        domain: "fixture.example",
        detectedAt: "2026-08-20T12:00:00.000Z",
        comparable: true,
        reason: "same scoring model",
        materiality: "critical",
        changedFields: [{ field: "content.facts.za.uif.monthly_ceiling_zar.claims", from: ["17712"], to: ["1476"], materiality: "critical" }],
        scoreDelta: -60,
        verdictMoved: true,
        from: { snapshotId: 1, scannedAt: "2026-08-20T10:00:00.000Z", scannerVersion: "snapshot-v2", scoringVersion: "scoring-v2" },
        to: { snapshotId: 2, scannedAt: "2026-08-20T12:00:00.000Z", scannerVersion: "snapshot-v2", scoringVersion: "scoring-v2" },
      },
    ],
    historyCount: 2,
    ...overrides,
  };
}

describe("buildDigest", () => {
  it("renders the current state, findings, and changes as Markdown", () => {
    const md = buildDigest(input());
    expect(md).toContain("# SiteHealth Passport — fixture.example");
    expect(md).toContain("Verdict: **FAIL** (35/100)");
    expect(md).toContain("Content accuracy: **FAIL** (10/100, grade F, 3 page(s) scanned)");
    expect(md).toContain("Snapshots recorded: 2");
    expect(md).toContain("figure-mismatch | za.uif.monthly_ceiling_zar | page /");
    expect(md).toContain("[critical]");
    expect(md).toContain("Detected changes (latest 1)");
    expect(md).toContain("score delta -60");
    expect(md).toContain("verdict moved true");
    expect(md).toContain("GET /history and GET /changes");
  });

  it("handles a domain with no snapshots", () => {
    const md = buildDigest(input({ latest: null, content: null, changes: [], historyCount: 0 }));
    expect(md).toContain("No snapshots recorded for this domain yet.");
  });

  it("handles a clean latest scan (no findings, no changes)", () => {
    const md = buildDigest(
      input({
        content: { score: 95, grade: "A", status: "PASS", scope: { pagesScanned: 1, pagesPlanned: 1, sitemapFound: false, truncated: false }, findings: [] },
        changes: [],
        latest: { ...input().latest!, verdictStatus: "PASS", verdictScore: 90, contentScore: 95, contentStatus: "PASS" },
      })
    );
    expect(md).toContain("Content findings (latest scan)");
    expect(md).toContain("- none");
    expect(md).toContain("Verdict: **PASS** (90/100)");
  });
});

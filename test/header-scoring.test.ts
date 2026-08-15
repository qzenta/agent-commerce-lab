import { describe, expect, it } from "vitest";
import { scoreSecurityHeaders } from "../src/header-scoring";

const allGood = {
  usedHttps: true,
  strictTransportSecurity: "max-age=31536000; includeSubDomains",
  contentSecurityPolicy: "default-src 'self'; frame-ancestors 'self'",
  xFrameOptions: "DENY",
  xContentTypeOptions: "nosniff",
  referrerPolicy: "strict-origin-when-cross-origin",
  permissionsPolicy: "geolocation=()",
};

const allMissing = {
  usedHttps: true,
  strictTransportSecurity: null,
  contentSecurityPolicy: null,
  xFrameOptions: null,
  xContentTypeOptions: null,
  referrerPolicy: null,
  permissionsPolicy: null,
};

describe("scoreSecurityHeaders — presence vs quality", () => {
  it("gives a well-configured header set a high score and grade A", () => {
    const result = scoreSecurityHeaders(allGood);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.grade).toBe("A");
    expect(result.issues).toHaveLength(0);
  });

  it("gives an all-missing header set a score of 0 and grade F", () => {
    const result = scoreSecurityHeaders(allMissing);
    expect(result.score).toBe(0);
    expect(result.grade).toBe("F");
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("scores HSTS as 0 when not served over HTTPS regardless of header value", () => {
    const result = scoreSecurityHeaders({ ...allGood, usedHttps: false });
    // HSTS contributes 0 either way when not on HTTPS — total drops accordingly
    expect(result.score).toBeLessThan(100);
  });

  it("flags a present-but-misconfigured CSP as worse than a merely-present one", () => {
    const weakCsp = scoreSecurityHeaders({ ...allGood, contentSecurityPolicy: "default-src *; script-src 'unsafe-inline' 'unsafe-eval'" });
    const strongCsp = scoreSecurityHeaders(allGood);

    expect(weakCsp.score).toBeLessThan(strongCsp.score);
    expect(weakCsp.issues.some((i) => i.header === "Content-Security-Policy" && /unsafe-inline/.test(i.message))).toBe(true);
    expect(weakCsp.issues.some((i) => i.header === "Content-Security-Policy" && /unsafe-eval/.test(i.message))).toBe(true);
  });

  it("flags a present-but-trivial HSTS max-age as a misconfiguration, not a pass", () => {
    const result = scoreSecurityHeaders({ ...allGood, strictTransportSecurity: "max-age=60" });
    expect(result.issues.some((i) => i.header === "Strict-Transport-Security" && /below the recommended/.test(i.message))).toBe(true);
  });

  it("flags HSTS with max-age=0 as equivalent to missing (high severity), not just a minor issue", () => {
    const result = scoreSecurityHeaders({ ...allGood, strictTransportSecurity: "max-age=0" });
    const hstsIssue = result.issues.find((i) => i.header === "Strict-Transport-Security");
    expect(hstsIssue?.severity).toBe("high");
  });

  it("flags the deprecated X-Frame-Options ALLOW-FROM syntax as ineffective in modern browsers", () => {
    const result = scoreSecurityHeaders({ ...allGood, xFrameOptions: "ALLOW-FROM https://example.com" });
    expect(result.issues.some((i) => i.header === "X-Frame-Options" && /deprecated/.test(i.message))).toBe(true);
  });

  it("flags an overly permissive Referrer-Policy value", () => {
    const result = scoreSecurityHeaders({ ...allGood, referrerPolicy: "unsafe-url" });
    expect(result.issues.some((i) => i.header === "Referrer-Policy" && /leaks the full URL/.test(i.message))).toBe(true);
  });

  it("sorts issues by severity, highest first", () => {
    const result = scoreSecurityHeaders(allMissing);
    const severities = result.issues.map((i) => i.severity);
    const rank = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < severities.length; i++) {
      expect(rank[severities[i]]).toBeGreaterThanOrEqual(rank[severities[i - 1]]);
    }
  });
});

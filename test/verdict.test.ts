import { describe, expect, it } from "vitest";
import { buildVerdict } from "../src/verdict";
import { scoreSecurityHeaders } from "../src/header-scoring";
import type { TlsProbeResult } from "../src/tls-probe";

const goodHeaders = scoreSecurityHeaders({
  usedHttps: true,
  strictTransportSecurity: "max-age=31536000; includeSubDomains",
  contentSecurityPolicy: "default-src 'self'; frame-ancestors 'self'",
  xFrameOptions: "DENY",
  xContentTypeOptions: "nosniff",
  referrerPolicy: "strict-origin-when-cross-origin",
  permissionsPolicy: "geolocation=()",
});

const badHeaders = scoreSecurityHeaders({
  usedHttps: true,
  strictTransportSecurity: null,
  contentSecurityPolicy: null,
  xFrameOptions: null,
  xContentTypeOptions: null,
  referrerPolicy: null,
  permissionsPolicy: null,
});

const strongTls: TlsProbeResult = {
  version: "TLS 1.3",
  cipherSuite: "TLS_AES_128_GCM_SHA256",
  cipherSuiteId: "0x1301",
  weak: false,
  error: null,
};

const weakTls: TlsProbeResult = {
  version: "TLS 1.2",
  cipherSuite: "RSA-AES128-GCM-SHA256",
  cipherSuiteId: "0x009c",
  weak: true,
  error: null,
};

describe("buildVerdict", () => {
  it("returns PASS for a fully healthy site", () => {
    const verdict = buildVerdict({ httpOk: true, httpError: null, usedHttps: true, headerScore: goodHeaders, tls: strongTls });
    expect(verdict.status).toBe("PASS");
    expect(verdict.topIssues).toHaveLength(0);
  });

  it("returns FAIL immediately when the target is unreachable, independent of header/TLS state", () => {
    const verdict = buildVerdict({ httpOk: false, httpError: "connection refused", usedHttps: false, headerScore: badHeaders, tls: weakTls });
    expect(verdict.status).toBe("FAIL");
    expect(verdict.score).toBe(0);
    expect(verdict.topIssues).toContain("connection refused");
  });

  it("caps the score low for a plaintext HTTP site even with perfect headers", () => {
    const verdict = buildVerdict({ httpOk: true, httpError: null, usedHttps: false, headerScore: goodHeaders, tls: strongTls });
    expect(verdict.score).toBeLessThanOrEqual(20);
    expect(verdict.topIssues.some((i) => /not served over HTTPS/.test(i))).toBe(true);
  });

  it("caps the score for a weak/legacy TLS cipher even with perfect headers", () => {
    const verdict = buildVerdict({ httpOk: true, httpError: null, usedHttps: true, headerScore: goodHeaders, tls: weakTls });
    expect(verdict.score).toBeLessThanOrEqual(60);
    expect(verdict.topIssues.some((i) => /weak\/legacy/.test(i))).toBe(true);
  });

  it("returns FAIL for a site with all security headers missing", () => {
    const verdict = buildVerdict({ httpOk: true, httpError: null, usedHttps: true, headerScore: badHeaders, tls: strongTls });
    expect(verdict.status).toBe("FAIL");
    expect(verdict.topIssues.length).toBeGreaterThan(0);
  });

  it("caps topIssues at 5 even when more are found", () => {
    const verdict = buildVerdict({ httpOk: true, httpError: null, usedHttps: false, headerScore: badHeaders, tls: weakTls });
    expect(verdict.topIssues.length).toBeLessThanOrEqual(5);
  });

  it("summary always mentions the header grade", () => {
    const verdict = buildVerdict({ httpOk: true, httpError: null, usedHttps: true, headerScore: goodHeaders, tls: strongTls });
    expect(verdict.summary).toContain(goodHeaders.grade);
  });
});

import { describe, expect, it } from "vitest";
import { runSecuritySnapshot } from "../src/snapshot";

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

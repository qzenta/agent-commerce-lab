import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  formatBatchPrice,
  validateBatchDomains,
  runBatchSnapshots,
  BATCH_MIN_DOMAINS,
  BATCH_MAX_DOMAINS,
  BATCH_CONCURRENCY,
  BATCH_DEADLINE_MS,
} from "../src/batch";
import app from "../src/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Canned security headers so a scan completes with a usable snapshot. */
function targetResponse(status = 200): Response {
  return new Response(
    '<html><head><meta name="generator" content="TestCMS"></head><body>ok</body></html>',
    {
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
    }
  );
}

/** DoH answers from 1.1.1.1 — A resolves to a public address, rest empty. */
function dohResponse(): Response {
  return new Response(JSON.stringify({ Answer: [{ type: 1, data: "93.184.216.34" }] }), {
    status: 200,
  });
}

function dohOnlyResponse(): Response {
  return new Response(JSON.stringify({ Answer: [] }), { status: 200 });
}

/**
 * fetch stub covering the whole snapshot pipeline: DoH lookups (SSRF guard +
 * DNS checks) and the target fetch. `failHosts` makes the target fetch throw
 * (simulating an unreachable origin) for the named hostnames.
 */
function makeFetchStub(opts?: { failHosts?: string[]; targetDelayMs?: number }) {
  const failHosts = new Set(opts?.failHosts ?? []);
  const delay = opts?.targetDelayMs ?? 0;
  let targetInFlight = 0;
  let maxTargetInFlight = 0;
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "1.1.1.1") {
      const type = url.searchParams.get("type") ?? "";
      if (type === "AAAA" || type === "MX" || type === "TXT") return dohOnlyResponse();
      return dohResponse();
    }
    if (failHosts.has(url.hostname)) {
      throw new Error("connection refused");
    }
    targetInFlight++;
    maxTargetInFlight = Math.max(maxTargetInFlight, targetInFlight);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    targetInFlight--;
    return targetResponse();
  });
  return { fetchFn, getMaxTargetInFlight: () => maxTargetInFlight };
}

const TEST_PAY_TO = "0x1866Fd80B1196AcC70A98a50917A8FD4639FE823";
// Cloudflare rate-limit binding stubs — always allow through.
const testEnv = {
  X402_NETWORK: "base-sepolia",
  X402_PAY_TO: TEST_PAY_TO,
  DISCOVERY_RATE_LIMITER: { limit: async () => ({ success: true }) },
  SNAPSHOT_RATE_LIMITER: { limit: async () => ({ success: true }) },
} as unknown as Parameters<typeof app.request>[2];

function postBatch(domains: string[], env = testEnv) {
  return app.request(
    "/snapshot/batch",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domains }),
    },
    env
  );
}

// ---------------------------------------------------------------------------
// formatBatchPrice — dynamic per-domain pricing
// ---------------------------------------------------------------------------

describe("formatBatchPrice", () => {
  it("prices the batch at $0.01 per domain, in integer cents", () => {
    expect(formatBatchPrice(2)).toBe("$0.02");
    expect(formatBatchPrice(5)).toBe("$0.05");
    expect(formatBatchPrice(10)).toBe("$0.10");
    expect(formatBatchPrice(20)).toBe("$0.20");
  });
});

// ---------------------------------------------------------------------------
// validateBatchDomains
// ---------------------------------------------------------------------------

describe("validateBatchDomains", () => {
  it("accepts 2-20 domains and trims whitespace", () => {
    const result = validateBatchDomains({
      domains: [" https://example.com ", "https://example.org"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.domains).toEqual(["https://example.com", "https://example.org"]);
  });

  it("rejects fewer than 2 domains", () => {
    const one = validateBatchDomains({ domains: ["https://example.com"] });
    expect(one.ok).toBe(false);
    if (!one.ok) expect(one.error).toMatch(new RegExp(`${BATCH_MIN_DOMAINS} and ${BATCH_MAX_DOMAINS}`));
    const none = validateBatchDomains({ domains: [] });
    expect(none.ok).toBe(false);
  });

  it("rejects more than 20 domains", () => {
    const many = Array.from({ length: BATCH_MAX_DOMAINS + 1 }, (_, i) => `https://d${i}.com`);
    const result = validateBatchDomains({ domains: many });
    expect(result.ok).toBe(false);
  });

  it("rejects a missing, non-array, or malformed domains field", () => {
    expect(validateBatchDomains({}).ok).toBe(false);
    expect(validateBatchDomains({ domains: "x" }).ok).toBe(false);
    expect(validateBatchDomains(null).ok).toBe(false);
    expect(validateBatchDomains([]).ok).toBe(false);
    expect(validateBatchDomains("x").ok).toBe(false);
  });

  it("rejects non-string or empty entries", () => {
    expect(validateBatchDomains({ domains: ["https://a.com", 42] }).ok).toBe(false);
    expect(validateBatchDomains({ domains: ["https://a.com", ""] }).ok).toBe(false);
    expect(validateBatchDomains({ domains: ["https://a.com", "   "] }).ok).toBe(false);
  });

  it("rejects exact duplicates (including whitespace-normalized)", () => {
    expect(
      validateBatchDomains({ domains: ["https://a.com", "https://a.com"] }).ok
    ).toBe(false);
    expect(
      validateBatchDomains({ domains: ["https://a.com", " https://a.com "] }).ok
    ).toBe(false);
  });

  it("accepts the optional boolean content flag and defaults it to false", () => {
    const yes = validateBatchDomains({ domains: ["https://a.com", "https://b.com"], content: true });
    expect(yes.ok).toBe(true);
    if (yes.ok) expect(yes.content).toBe(true);

    const no = validateBatchDomains({ domains: ["https://a.com", "https://b.com"] });
    expect(no.ok).toBe(true);
    if (no.ok) expect(no.content).toBe(false);

    const explicitFalse = validateBatchDomains({ domains: ["https://a.com", "https://b.com"], content: false });
    expect(explicitFalse.ok).toBe(true);
    if (explicitFalse.ok) expect(explicitFalse.content).toBe(false);
  });

  it("rejects a non-boolean content flag", () => {
    expect(validateBatchDomains({ domains: ["https://a.com", "https://b.com"], content: "yes" }).ok).toBe(false);
    expect(validateBatchDomains({ domains: ["https://a.com", "https://b.com"], content: 1 }).ok).toBe(false);
    expect(validateBatchDomains({ domains: ["https://a.com", "https://b.com"], content: null }).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runBatchSnapshots — per-item isolation, order, concurrency, deadline
// ---------------------------------------------------------------------------

describe("runBatchSnapshots", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("returns one result per domain in request order", async () => {
    const { fetchFn } = makeFetchStub();
    vi.stubGlobal("fetch", fetchFn);
    const domains = ["https://example.com", "https://example.org", "https://example.net"];
    const res = await runBatchSnapshots(domains, { concurrency: 2 });
    expect(res.results.map((r) => r.domain)).toEqual(domains);
    expect(res.results.every((r) => r.ok && r.snapshot)).toBe(true);
  });

  it("isolates input-level failures (AC2: a bad domain never fails the batch)", async () => {
    const { fetchFn } = makeFetchStub();
    vi.stubGlobal("fetch", fetchFn);
    const res = await runBatchSnapshots(
      ["https://example.com", "not a url", "ftp://example.com"],
      { concurrency: 2 }
    );
    expect(res.results).toHaveLength(3);
    expect(res.results[0].ok).toBe(true);
    expect(res.results[0].snapshot).toBeDefined();
    expect(res.results[0].error).toBeUndefined();
    expect(res.results[1].ok).toBe(false);
    expect(res.results[1].error).toMatch(/invalid URL/);
    expect(res.results[1].snapshot).toBeUndefined();
    expect(res.results[2].ok).toBe(false);
    expect(res.results[2].error).toMatch(/only http\/https/);
  });

  it("keeps ok:true with a FAIL-verdict snapshot for an unreachable domain", async () => {
    const { fetchFn } = makeFetchStub({ failHosts: ["down.example.com"] });
    vi.stubGlobal("fetch", fetchFn);
    const res = await runBatchSnapshots(["https://example.com", "https://down.example.com"], {
      concurrency: 2,
    });
    expect(res.results[1].ok).toBe(true);
    expect(res.results[1].snapshot?.http.error).toMatch(/connection refused/);
    expect(res.results[1].snapshot?.verdict.status).toBe("FAIL");
  });

  it("bounds concurrency to the configured pool size", async () => {
    const { fetchFn, getMaxTargetInFlight } = makeFetchStub({ targetDelayMs: 30 });
    vi.stubGlobal("fetch", fetchFn);
    const domains = Array.from({ length: 6 }, (_, i) => `https://d${i}.com`);
    const res = await runBatchSnapshots(domains, { concurrency: 2, deadlineMs: 10_000 });
    expect(getMaxTargetInFlight()).toBeLessThanOrEqual(2);
    expect(res.results).toHaveLength(6);
    expect(res.results.every((r) => r.ok)).toBe(true);
  });

  it("honors the wall-clock deadline, reporting unstarted items as errors", async () => {
    const { fetchFn } = makeFetchStub({ targetDelayMs: 120 });
    vi.stubGlobal("fetch", fetchFn);
    const domains = Array.from({ length: 6 }, (_, i) => `https://d${i}.com`);
    const started = Date.now();
    const res = await runBatchSnapshots(domains, { concurrency: 2, deadlineMs: 30 });
    const elapsed = Date.now() - started;
    // Items 0 and 1 started before the deadline; everything after is skipped.
    expect(res.results[0].ok).toBe(true);
    expect(res.results[1].ok).toBe(true);
    expect(res.results.slice(2).every((r) => !r.ok && r.error === "batch deadline exceeded")).toBe(true);
    // Deadline bound: far less than the ~720ms the 6 scans would take sequentially.
    expect(elapsed).toBeLessThan(600);
  });

  it("uses the documented defaults (concurrency 5, 30s deadline)", () => {
    expect(BATCH_CONCURRENCY).toBe(5);
    expect(BATCH_DEADLINE_MS).toBe(30_000);
  });
});

// ---------------------------------------------------------------------------
// Route-level: POST /snapshot/batch through the Hono app
// ---------------------------------------------------------------------------

describe("POST /snapshot/batch route", () => {
  it("is advertised in the free discovery JSON", async () => {
    const res = await app.request("/", undefined, testEnv);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { endpoints?: string[] };
    expect(body.endpoints?.some((e) => e.includes("/snapshot/batch"))).toBe(true);
  });

  it("returns 400 for out-of-range batches BEFORE any payment challenge", async () => {
    // 1 domain — below the 2-20 range.
    const one = await postBatch(["https://example.com"]);
    expect(one.status).toBe(400);
    // 21 domains — above the range.
    const many = Array.from({ length: BATCH_MAX_DOMAINS + 1 }, (_, i) => `https://d${i}.com`);
    const tooMany = await postBatch(many);
    expect(tooMany.status).toBe(400);
    // 0 domains.
    const none = await postBatch([]);
    expect(none.status).toBe(400);
  });

  it("returns 400 for malformed bodies before any payment challenge", async () => {
    const malformed = await app.request(
      "/snapshot/batch",
      { method: "POST", body: "{not json" },
      testEnv
    );
    expect(malformed.status).toBe(400);

    const missing = await app.request(
      "/snapshot/batch",
      { method: "POST", body: JSON.stringify({ nope: [] }) },
      testEnv
    );
    expect(missing.status).toBe(400);

    const duplicates = await postBatch(["https://a.com", "https://a.com"]);
    expect(duplicates.status).toBe(400);
  });

  it("returns 402 with per-domain pricing matching /snapshot/run's shape (AC4)", async () => {
    const two = await postBatch(["https://example.com", "https://example.org"]);
    expect(two.status).toBe(402);
    const twoBody = (await two.json()) as {
      error: string;
      accepts: Array<Record<string, unknown>>;
      x402Version: number;
    };
    expect(twoBody.error).toBe("X-PAYMENT header is required");
    expect(twoBody.x402Version).toBe(1);
    expect(twoBody.accepts).toHaveLength(1);
    const req = twoBody.accepts[0];
    expect(req.scheme).toBe("exact");
    expect(req.network).toBe("base-sepolia");
    expect(req.maxAmountRequired).toBe("20000"); // $0.02 for 2 domains
    expect(req.payTo).toBe(TEST_PAY_TO);
    expect(String(req.resource)).toMatch(/\/snapshot\/batch$/);

    // 20 domains -> $0.20 = 200000 atomic units.
    const twenty = Array.from({ length: BATCH_MAX_DOMAINS }, (_, i) => `https://d${i}.com`);
    const twentyRes = await postBatch(twenty);
    const twentyBody = (await twentyRes.json()) as { accepts: Array<{ maxAmountRequired: string }> };
    expect(twentyBody.accepts[0].maxAmountRequired).toBe("200000");

    // Same top-level shape as /snapshot/run's 402 (which stays at $0.01).
    const single = await app.request("/snapshot/run?url=https://example.com", undefined, testEnv);
    expect(single.status).toBe(402);
    const singleBody = (await single.json()) as {
      error: string;
      accepts: Array<{ maxAmountRequired: string }>;
      x402Version: number;
    };
    expect(Object.keys(singleBody).sort()).toEqual(Object.keys(twoBody).sort());
    expect(singleBody.accepts[0].maxAmountRequired).toBe("10000"); // unchanged $0.01
  });
});

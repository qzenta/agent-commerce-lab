import { Hono, type MiddlewareHandler } from "hono";
import { paymentMiddleware, type RoutesConfig } from "x402-hono";
import { runSecuritySnapshot } from "./snapshot";
import {
  formatBatchPrice,
  runBatchSnapshots,
  validateBatchDomains,
} from "./batch";
import {
  listChangeHistory,
  listSnapshotHistory,
  parseListLimit,
  runSnapshotWithHistory,
  getLatestSnapshotRaw,
  domainKey,
} from "./history";
import { buildDigest } from "./report";
import { runScheduledScans, parseMonitorDomains } from "./scheduled";
// Single source of truth for the spec lives in docs/agent-commerce/ (human +
// agent-facing docs); imported here so the served copy can't drift from it.
import openApiSpec from "../docs/agent-commerce/openapi.json";

type Bindings = {
  X402_NETWORK: "base-sepolia" | "base";
  X402_PAY_TO: `0x${string}`;
  DISCOVERY_RATE_LIMITER: RateLimit;
  SNAPSHOT_RATE_LIMITER: RateLimit;
  HISTORY_DB: D1Database;
  /** Comma-separated http(s) URLs the scheduled (cron) scan monitors (P0). */
  MONITOR_DOMAINS?: string;
  /** Optional alert delivery webhook (email provider endpoint etc.). */
  ALERT_WEBHOOK_URL?: string;
};

// Variables: per-request context stashed by middlewares for later
// middlewares/handlers (the batch body is read exactly once).
type AppEnv = {
  Bindings: Bindings;
  Variables: { batchDomains?: string[]; batchContent?: boolean };
};

export const app = new Hono<AppEnv>();

// Structured request logging — one JSON line per request via console.log,
// which Cloudflare captures in `wrangler tail` / Logpush without needing a
// separate observability service. Registered first so it also captures
// requests the rate limiter or payment middleware reject.
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      latencyMs: Date.now() - start,
      ip: c.req.header("CF-Connecting-IP") ?? "unknown",
      cfRay: c.req.header("CF-Ray") ?? null,
    })
  );
});

// Payment settles per call, so /snapshot/* is naturally cost-gated once a
// request clears the 402 challenge — but the pre-payment 402 check itself
// (and the free discovery endpoint) can be hit for free, so both get an
// IP-keyed rate limit ahead of any other logic.
function rateLimitByIp(
  getLimiter: (env: Bindings) => RateLimit
): MiddlewareHandler<{ Bindings: Bindings }> {
  return async (c, next) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const { success } = await getLimiter(c.env).limit({ key: ip });
    if (!success) {
      return c.json({ error: "rate limit exceeded, try again shortly" }, 429);
    }
    return next();
  };
}

app.use("/", rateLimitByIp((env) => env.DISCOVERY_RATE_LIMITER));
app.use("/snapshot/*", rateLimitByIp((env) => env.SNAPSHOT_RATE_LIMITER));
// Free read endpoints for history/change detection — cheap reads that could
// otherwise be scraped at volume, so they reuse the discovery bucket.
app.use("/history/*", rateLimitByIp((env) => env.DISCOVERY_RATE_LIMITER));
app.use("/changes/*", rateLimitByIp((env) => env.DISCOVERY_RATE_LIMITER));
// Pilot ops endpoints (P0): alerts, report digest, findings review.
app.use("/alerts/*", rateLimitByIp((env) => env.DISCOVERY_RATE_LIMITER));
app.use("/report/*", rateLimitByIp((env) => env.DISCOVERY_RATE_LIMITER));
app.use("/findings/*", rateLimitByIp((env) => env.DISCOVERY_RATE_LIMITER));

// Unpaid: service description for agent discovery. Lets an agent (or a
// human) see what this endpoint does and what it costs before paying.
app.get("/", (c) => {
  return c.json({
    service: "Qzenta Website Security Snapshot",
    description:
      "Fetches a URL and returns a structured, non-invasive security snapshot: " +
      "HTTP status, redirect chain, HTTPS usage, common security headers, and " +
      "basic technology observations.",
    endpoint: "GET /snapshot?url=<target>",
    endpoints: [
      "GET /snapshot/run?url=<target> — single domain, $0.01",
      "GET /snapshot/run?url=<target>&content=true — single domain + content-accuracy sub-scan (regulatory figures, cross-page contradictions), $0.01",
      "POST /snapshot/batch — 2-20 domains in one paid call, $0.01 per domain (add \"content\": true for per-domain content sub-scans)",
      "GET /history?domain=<host> — past snapshots for a domain (free)",
      "GET /changes?domain=<host> — detected changes for a domain (free)",
    ],
    price: "$0.01 test USDC (base-sepolia — no real funds)",
    network: c.env.X402_NETWORK,
    status: "proof-of-concept — not for production traffic",
    provider: "Qzenta (Pty) Ltd — https://qzenta.com",
  });
});

// POST /snapshot/batch — parse + validate the body BEFORE the payment gate,
// so invalid requests get a 400 without ever seeing a 402 challenge, and so
// the payment middleware below can price the request from the domain count.
// The body stream is consumed exactly once here and stashed on the context.
app.use("/snapshot/batch", async (c, next) => {
  let raw = "";
  try {
    raw = await c.req.text();
  } catch {
    return c.json({ error: "unable to read request body" }, 400);
  }
  let body: unknown = null;
  if (raw.length > 0) {
    try {
      body = JSON.parse(raw);
    } catch {
      return c.json({ error: "request body must be valid JSON" }, 400);
    }
  }
  const validation = validateBatchDomains(body);
  if (!validation.ok) {
    return c.json({ error: validation.error }, 400);
  }
  c.set("batchDomains", validation.domains);
  c.set("batchContent", validation.content);
  return next();
});

// Payment-gated route. paymentMiddleware intercepts unpaid requests to
// /snapshot/* with a 402 + payment instructions; only lets the request
// through to the handler below once a valid payment is verified/settled.
// POST /snapshot/batch is priced per domain ($0.01 x N, read from the body
// parsed above); every other /snapshot/* route keeps the single-scan price.
// paymentMiddleware resolves `price` on every request, so a per-request
// routes config is all the dynamic pricing needs — /snapshot/run's config
// value is byte-for-byte unchanged.
app.use(
  "/snapshot/*",
  async (c, next) => {
    const isBatch = c.req.path === "/snapshot/batch";
    const batchDomains = c.get("batchDomains");
    const routes: RoutesConfig =
      isBatch && batchDomains
        ? {
            "/snapshot/batch": {
              price: formatBatchPrice(batchDomains.length),
              network: c.env.X402_NETWORK,
              config: {
                description: `Batch scan of ${batchDomains.length} domains ($0.01 per domain)`,
                discoverable: true,
              },
            },
          }
        : {
            "/snapshot/*": {
              price: "$0.01",
              network: c.env.X402_NETWORK,
              config: {
                description: "One website security snapshot",
                discoverable: true,
              },
            },
          };
    const mw = paymentMiddleware(
      c.env.X402_PAY_TO,
      routes
      // No facilitator override passed — defaults to https://x402.org/facilitator,
      // the public Coinbase-operated facilitator used in all Cloudflare examples.
    );
    return mw(c, next);
  }
);

// Machine-readable contract — x402scan and similar indexers use this for
// discovery, then validate the runtime 402 behavior against it. Must never
// drift from what the routes below actually do.
app.get("/openapi.json", (c) => {
  return c.json(openApiSpec);
});

app.get("/snapshot/run", async (c) => {
  const target = c.req.query("url");
  if (!target) {
    return c.json({ error: "missing required query param: url" }, 400);
  }

  // v2: the content-accuracy sub-scan is opt-in via content=true and is
  // independent of the history opt-in below (both may be enabled together).
  const snapshot = await runSecuritySnapshot(target, {
    content: c.req.query("content") === "true",
    groundTruthDb: c.env.HISTORY_DB,
  });

  // Cycle 2: opt-in history/change detection. Only the exact value "true"
  // enables it; anything else (absent, "false", "1", ...) takes the original
  // code path below, which is byte-for-byte unchanged from pre-Cycle-2.
  if (c.req.query("history") === "true") {
    const change = await runSnapshotWithHistory(c.env.HISTORY_DB, snapshot);
    return c.json({ ...snapshot, change });
  }

  return c.json(snapshot);
});

// Free read endpoints — summary columns + provenance only (Gate 0 Q6 intent
// reading). Partial/failed observations ARE listed; they are simply never
// selected as comparison anchors.
app.get("/history", async (c) => {
  const domain = c.req.query("domain");
  if (!domain) {
    return c.json({ error: "missing required query param: domain" }, 400);
  }
  try {
    const result = await listSnapshotHistory(
      c.env.HISTORY_DB,
      domain,
      parseListLimit(c.req.query("limit")),
      c.req.query("before") ?? undefined
    );
    return c.json({ domain: result.domain, snapshots: result.items, ...(result.nextBefore ? { nextBefore: result.nextBefore } : {}) });
  } catch (err) {
    console.log(JSON.stringify({ event: "history_read_failed", endpoint: "history", domain, error: err instanceof Error ? err.message : String(err) }));
    return c.json({ error: "history storage unavailable" }, 500);
  }
});

app.get("/changes", async (c) => {
  const domain = c.req.query("domain");
  if (!domain) {
    return c.json({ error: "missing required query param: domain" }, 400);
  }
  try {
    const result = await listChangeHistory(
      c.env.HISTORY_DB,
      domain,
      parseListLimit(c.req.query("limit")),
      c.req.query("before") ?? undefined
    );
    return c.json({ domain: result.domain, changes: result.items, ...(result.nextBefore ? { nextBefore: result.nextBefore } : {}) });
  } catch (err) {
    console.log(JSON.stringify({ event: "history_read_failed", endpoint: "changes", domain, error: err instanceof Error ? err.message : String(err) }));
    return c.json({ error: "history storage unavailable" }, 500);
  }
});

// Batch/portfolio scan — 2-20 domains in one paid call. The body middleware
// registered above has already parsed + validated the body (400 before any
// payment challenge) and priced the x402 challenge ($0.01 x N); the handler
// only runs the bounded fan-out and returns the per-item results envelope.
app.post("/snapshot/batch", async (c) => {
  const domains = c.get("batchDomains");
  if (!domains || domains.length === 0) {
    return c.json({ error: "invalid batch request" }, 400);
  }
  return c.json(
    await runBatchSnapshots(domains, {
      content: c.get("batchContent") ?? false,
      groundTruthDb: c.env.HISTORY_DB,
    })
  );
});

// ---------------------------------------------------------------------------
// Pilot ops endpoints (Gate 4 P0) — free, discovery-rate-limited.
// ---------------------------------------------------------------------------

// GET /alerts?domain=<host> — recorded alerts for a domain, newest first.
app.get("/alerts", async (c) => {
  const domain = c.req.query("domain");
  if (!domain) {
    return c.json({ error: "missing required query param: domain" }, 400);
  }
  try {
    const limit = parseListLimit(c.req.query("limit"), 20, 100);
    const res = await c.env.HISTORY_DB.prepare(
      `SELECT id, domain, detected_at, change_id, materiality, verdict_moved, summary, delivered_at, delivery_error
       FROM alerts
       WHERE domain = ?1
       ORDER BY detected_at DESC LIMIT ?2`
    )
      .bind(domain, limit)
      .all();
    return c.json({ domain, alerts: res.results });
  } catch (err) {
    console.log(JSON.stringify({ event: "alerts_read_failed", domain, error: err instanceof Error ? err.message : String(err) }));
    return c.json({ error: "alerts storage unavailable" }, 500);
  }
});

// GET /report?domain=<host> — Markdown digest (monthly digest / evidence export).
app.get("/report", async (c) => {
  const domain = c.req.query("domain");
  if (!domain) {
    return c.json({ error: "missing required query param: domain" }, 400);
  }
  try {
    const key = domainKey(domain);
    const history = await listSnapshotHistory(c.env.HISTORY_DB, key, 100);
    const changes = await listChangeHistory(c.env.HISTORY_DB, key, 20);
    const raw = await getLatestSnapshotRaw(c.env.HISTORY_DB, key);
    const latest = history.items[0] ?? null;
    const content =
      raw?.content === undefined
        ? null
        : {
            score: raw.content.score,
            grade: raw.content.grade,
            status: raw.content.status,
            scope: raw.content.scope,
            findings: raw.content.findings,
          };
    const digest = buildDigest({
      domain: key,
      generatedAt: new Date().toISOString(),
      latest,
      content,
      changes: changes.items,
      historyCount: history.items.length,
    });
    return new Response(digest, { headers: { "content-type": "text/markdown; charset=utf-8" } });
  } catch (err) {
    console.log(JSON.stringify({ event: "report_failed", domain, error: err instanceof Error ? err.message : String(err) }));
    return c.json({ error: "report unavailable" }, 500);
  }
});

// GET /findings?domain=<host> — content findings from the latest snapshot,
// annotated with review status (FP-rate scaffold).
app.get("/findings", async (c) => {
  const domain = c.req.query("domain");
  if (!domain) {
    return c.json({ error: "missing required query param: domain" }, 400);
  }
  try {
    const key = domainKey(domain);
    const raw = await getLatestSnapshotRaw(c.env.HISTORY_DB, key);
    if (!raw?.content) {
      return c.json({ domain: key, findings: [], note: "no content scan recorded for this domain yet" });
    }
    const reviewRes = await c.env.HISTORY_DB.prepare(
      `SELECT finding_key, status, ruled_by, ruled_at, notes FROM findings_review WHERE domain = ?1`
    )
      .bind(key)
      .all();
    const rulings = new Map(
      (reviewRes.results as Array<{ finding_key: string; status: string; ruled_by: string | null; ruled_at: string | null; notes: string | null }>).map((r) => [
        r.finding_key,
        r,
      ])
    );
    const findings = raw.content.findings.map((f) => {
      const fk = `${f.type}:${f.factKey}`;
      const ruling = rulings.get(fk);
      return {
        ...f,
        findingKey: fk,
        review: ruling ?? { status: "pending", ruled_by: null, ruled_at: null, notes: null },
      };
    });
    return c.json({ domain: key, scannedAt: raw.timestamp, findings });
  } catch (err) {
    console.log(JSON.stringify({ event: "findings_read_failed", domain, error: err instanceof Error ? err.message : String(err) }));
    return c.json({ error: "findings unavailable" }, 500);
  }
});

// POST /findings/review — record a human ruling on a finding (FP-rate scaffold).
// Rulings are human-only (Daniel or a designated reviewer); DSH never rules its
// own findings. Upsert is SELECT-then-UPDATE-or-INSERT (D1-safe).
app.post("/findings/review", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "request body must be valid JSON" }, 400);
  }
  const b = body as { domain?: unknown; findingKey?: unknown; status?: unknown; notes?: unknown };
  if (typeof b.domain !== "string" || typeof b.findingKey !== "string") {
    return c.json({ error: "domain and findingKey are required strings" }, 400);
  }
  if (b.status !== "confirmed" && b.status !== "false-positive" && b.status !== "pending") {
    return c.json({ error: "status must be confirmed | false-positive | pending" }, 400);
  }
  const notes = typeof b.notes === "string" ? b.notes : null;
  const key = domainKey(b.domain);
  const now = new Date().toISOString();
  const existing = await c.env.HISTORY_DB.prepare(
    `SELECT id FROM findings_review WHERE domain = ?1 AND finding_key = ?2`
  )
    .bind(key, b.findingKey)
    .first();
  try {
    if (existing) {
      await c.env.HISTORY_DB.prepare(
        `UPDATE findings_review SET status = ?3, ruled_by = ?4, ruled_at = ?5, notes = ?6 WHERE domain = ?1 AND finding_key = ?2`
      )
        .bind(key, b.findingKey, b.status, "reviewer", now, notes)
        .run();
    } else {
      await c.env.HISTORY_DB.prepare(
        `INSERT INTO findings_review (domain, finding_key, status, ruled_by, ruled_at, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
        .bind(key, b.findingKey, b.status, "reviewer", now, notes)
        .run();
    }
  } catch (err) {
    console.log(JSON.stringify({ event: "findings_review_write_failed", domain: key, error: err instanceof Error ? err.message : String(err) }));
    return c.json({ error: "review storage unavailable" }, 500);
  }
  return c.json({ ok: true, domain: key, findingKey: b.findingKey, status: b.status, ruledAt: now });
});

// ---------------------------------------------------------------------------
// Scheduled handler (Gate 4 P0): cron-invoked scans of MONITOR_DOMAINS via the
// same pipeline the paid endpoint runs — the "internal scan path" (no HTTP
// payment gate; the customer's invoice/EFT authorises the service).
// ---------------------------------------------------------------------------
export async function scheduled(
  _event: unknown,
  env: Bindings,
  ctx: ExecutionContext
): Promise<void> {
  const domains = parseMonitorDomains(env.MONITOR_DOMAINS);
  if (domains.length === 0) {
    console.log(JSON.stringify({ event: "scheduled_scan_skipped", reason: "MONITOR_DOMAINS unset" }));
    return;
  }
  ctx.waitUntil(
    runScheduledScans(env.HISTORY_DB, {
      domains,
      webhookUrl: env.ALERT_WEBHOOK_URL,
    }).then((results) => {
      for (const r of results) {
        console.log(JSON.stringify({ event: "scheduled_scan_done", domain: r.domain, ok: r.ok, error: r.error ?? null, changeComparable: r.change?.comparable ?? null, alert: r.alert ? { materiality: r.alert.materiality, deliveredAt: r.alert.delivered_at } : null }));
      }
    })
  );
}

// Workers entry: fetch (Hono) + scheduled (cron). Named `app` stays exported so
// the test suite can call app.request(...) directly.
export default { fetch: app.fetch, scheduled };


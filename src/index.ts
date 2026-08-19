import { Hono, type MiddlewareHandler } from "hono";
import { paymentMiddleware, type RoutesConfig } from "x402-hono";
import { runSecuritySnapshot } from "./snapshot";
import {
  formatBatchPrice,
  runBatchSnapshots,
  validateBatchDomains,
} from "./batch";
// Single source of truth for the spec lives in docs/agent-commerce/ (human +
// agent-facing docs); imported here so the served copy can't drift from it.
import openApiSpec from "../docs/agent-commerce/openapi.json";

type Bindings = {
  X402_NETWORK: "base-sepolia" | "base";
  X402_PAY_TO: `0x${string}`;
  DISCOVERY_RATE_LIMITER: RateLimit;
  SNAPSHOT_RATE_LIMITER: RateLimit;
};

// Variables: per-request context stashed by middlewares for later
// middlewares/handlers (the batch body is read exactly once).
type AppEnv = {
  Bindings: Bindings;
  Variables: { batchDomains?: string[] };
};

const app = new Hono<AppEnv>();

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
      "POST /snapshot/batch — 2-20 domains in one paid call, $0.01 per domain",
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

  const snapshot = await runSecuritySnapshot(target);
  return c.json(snapshot);
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
  return c.json(await runBatchSnapshots(domains));
});

export default app;

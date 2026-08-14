import { Hono, type MiddlewareHandler } from "hono";
import { paymentMiddleware } from "x402-hono";
import { runSecuritySnapshot } from "./snapshot";

type Bindings = {
  X402_NETWORK: "base-sepolia" | "base";
  X402_PAY_TO: `0x${string}`;
  DISCOVERY_RATE_LIMITER: RateLimit;
  SNAPSHOT_RATE_LIMITER: RateLimit;
};

const app = new Hono<{ Bindings: Bindings }>();

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
    price: "$0.001 test USDC (base-sepolia — no real funds)",
    network: c.env.X402_NETWORK,
    status: "proof-of-concept — not for production traffic",
    provider: "Qzenta (Pty) Ltd — https://qzenta.com",
  });
});

// Payment-gated route. paymentMiddleware intercepts unpaid requests to
// /snapshot/* with a 402 + payment instructions; only lets the request
// through to the handler below once a valid payment is verified/settled.
app.use(
  "/snapshot/*",
  async (c, next) => {
    const mw = paymentMiddleware(
      c.env.X402_PAY_TO,
      {
        "/snapshot/*": {
          price: "$0.001",
          network: c.env.X402_NETWORK,
          config: {
            description: "One website security snapshot",
            discoverable: true,
          },
        },
      }
      // No facilitator override passed — defaults to https://x402.org/facilitator,
      // the public Coinbase-operated facilitator used in all Cloudflare examples.
    );
    return mw(c, next);
  }
);

app.get("/snapshot/run", async (c) => {
  const target = c.req.query("url");
  if (!target) {
    return c.json({ error: "missing required query param: url" }, 400);
  }

  const snapshot = await runSecuritySnapshot(target);
  return c.json(snapshot);
});

export default app;

import { Hono } from "hono";
import { paymentMiddleware } from "x402-hono";
import { runSecuritySnapshot } from "./snapshot";

type Bindings = {
  X402_NETWORK: "base-sepolia" | "base";
  X402_PAY_TO: `0x${string}`;
};

const app = new Hono<{ Bindings: Bindings }>();

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

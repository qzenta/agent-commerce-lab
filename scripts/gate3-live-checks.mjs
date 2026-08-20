// Gate 3 live checks against the isolated staging worker (20 Aug 2026).
// Run: node scripts/gate3-live-checks.mjs [baseUrl]
import { readFileSync } from "node:fs";

const base = process.argv[2] ?? "https://qzenta-sitehealth-staging.qzenta.workers.dev";

async function get(path, opts) {
  const res = await fetch(base + path, opts);
  const text = await res.text();
  return { status: res.status, text, headers: Object.fromEntries(res.headers) };
}

const out = { base, checks: {} };

// 1. Discovery endpoint (free)
{
  const r = await get("/");
  out.checks.discovery = { status: r.status, body: safeJson(r.text) };
}

// 2. Served OpenAPI vs repo file (semantic compare: the Worker imports the repo
// spec and serves JSON.stringify of it, so byte identity is impossible — the
// repo file is pretty-printed; the served copy is compact. The drift check is
// deep-equality of the parsed objects.)
{
  const r = await get("/openapi.json");
  const repo = readFileSync(new URL("../docs/agent-commerce/openapi.json", import.meta.url), "utf8");
  let servedJson = null;
  let repoJson = null;
  try {
    servedJson = JSON.parse(r.text);
    repoJson = JSON.parse(repo);
  } catch {
    // leave null — reported below
  }
  out.checks.openapi = {
    status: r.status,
    servedParses: servedJson !== null,
    repoParses: repoJson !== null,
    semanticallyIdentical: servedJson !== null && repoJson !== null && JSON.stringify(servedJson) === JSON.stringify(repoJson),
    hasContentParam: Boolean(servedJson?.paths?.["/snapshot/run"]?.get?.parameters?.some((p) => p.name === "content")),
    hasContentBlock: Boolean(servedJson?.paths?.["/snapshot/run"]?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.properties?.content),
    hasHeaderScore: Boolean(servedJson?.paths?.["/snapshot/run"]?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.properties?.headerScore),
    hasVerdict: Boolean(servedJson?.paths?.["/snapshot/run"]?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.properties?.verdict),
    batchHasContentFlag: Boolean(servedJson?.paths?.["/snapshot/batch"]?.post?.requestBody?.content?.["application/json"]?.schema?.properties?.content),
  };
}

// 3. Pre-payment 402 shape (free check of the gate)
{
  const r = await get("/snapshot/run?url=https://example.com");
  const j = safeJson(r.text);
  out.checks.prepayment402 = {
    status: r.status,
    error: j?.error ?? null,
    accepts: Array.isArray(j?.accepts) ? j.accepts.map((a) => ({ scheme: a.scheme, network: a.network, maxAmountRequired: a.maxAmountRequired, asset: a.asset })) : null,
    x402Version: j?.x402Version ?? null,
  };
}

// 4. Free history read against the staging D1 (proves the binding is live)
{
  const r = await get("/history?domain=example.com");
  const j = safeJson(r.text);
  out.checks.history = { status: r.status, domain: j?.domain ?? null, snapshotCount: Array.isArray(j?.snapshots) ? j.snapshots.length : null, raw: r.text.slice(0, 200) };
}

// 5. Free changes read against the staging D1
{
  const r = await get("/changes?domain=example.com");
  const j = safeJson(r.text);
  out.checks.changes = { status: r.status, changeCount: Array.isArray(j?.changes) ? j.changes.length : null, raw: r.text.slice(0, 200) };
}

console.log(JSON.stringify(out, null, 2));

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

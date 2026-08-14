/**
 * Qzenta Website Security Snapshot — core scan logic.
 *
 * Non-invasive, read-only checks only: no auth bypass attempts, no
 * vulnerability exploitation, no brute forcing. Everything here is
 * information a normal HTTP client sees on a single GET request.
 */

import { checkHostnameAllowed, fetchWithTimeout } from "./ssrf-guard";

const FETCH_TIMEOUT_MS = 8000;

export interface SecuritySnapshot {
  target: string;
  timestamp: string;
  http: {
    status: number | null;
    ok: boolean;
    redirectChain: string[];
    finalUrl: string | null;
    error: string | null;
  };
  tls: {
    usedHttps: boolean;
    protocol: string | null;
  };
  dns: {
    hasA: boolean | null;
    hasAAAA: boolean | null;
    hasMX: boolean | null;
    hasTXT: boolean | null;
    note: string;
  };
  securityHeaders: {
    strictTransportSecurity: string | null;
    contentSecurityPolicy: string | null;
    xFrameOptions: string | null;
    xContentTypeOptions: string | null;
    referrerPolicy: string | null;
    permissionsPolicy: string | null;
  };
  techObservations: {
    server: string | null;
    poweredBy: string | null;
    poweredByCloudflare: boolean;
    cmsGuess: string | null;
  };
  findings: string[];
}

/** Follows redirects manually (capped) so we can report the chain. */
async function fetchWithChain(
  url: string,
  maxHops = 5
): Promise<{
  response: Response | null;
  chain: string[];
  finalUrl: string | null;
  error: string | null;
}> {
  const chain: string[] = [];
  let current = url;

  for (let hop = 0; hop <= maxHops; hop++) {
    chain.push(current);

    // Check every hop, not just the original URL — a redirect can point
    // internal even when the first host didn't.
    const hostname = new URL(current).hostname;
    const hostCheck = await checkHostnameAllowed(hostname);
    if (hostCheck.blocked) {
      return {
        response: null,
        chain,
        finalUrl: null,
        error: `blocked by SSRF guard: ${hostCheck.reason}`,
      };
    }

    try {
      const res = await fetchWithTimeout(
        current,
        {
          redirect: "manual",
          headers: {
            "User-Agent": "QzentaSecuritySnapshot/1.0 (+https://qzenta.com)",
          },
        },
        FETCH_TIMEOUT_MS
      );

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) return { response: res, chain, finalUrl: current, error: null };
        current = new URL(location, current).toString();
        continue;
      }

      return { response: res, chain, finalUrl: current, error: null };
    } catch (err) {
      return {
        response: null,
        chain,
        finalUrl: null,
        error: err instanceof Error ? err.message : "fetch failed",
      };
    }
  }

  return { response: null, chain, finalUrl: current, error: "too many redirects" };
}

function guessCms(headers: Headers, body: string): string | null {
  const poweredBy = headers.get("x-powered-by") || "";
  const generator = body.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i);
  if (generator) return generator[1];
  if (/wp-content|wp-includes/i.test(body)) return "WordPress (inferred from markup)";
  if (poweredBy) return poweredBy;
  return null;
}

export async function runSecuritySnapshot(rawUrl: string): Promise<SecuritySnapshot> {
  const timestamp = new Date().toISOString();
  let target: string;

  try {
    const parsed = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("only http/https URLs are supported");
    }
    target = parsed.toString();
  } catch {
    return emptySnapshot(rawUrl, timestamp, "invalid URL");
  }

  const { response, chain, finalUrl, error } = await fetchWithChain(target);
  const findings: string[] = [];

  if (error || !response) {
    findings.push(`Request failed: ${error ?? "unknown error"}`);
    return {
      target,
      timestamp,
      http: { status: null, ok: false, redirectChain: chain, finalUrl, error: error ?? "unknown error" },
      tls: { usedHttps: false, protocol: null },
      dns: emptyDns(),
      securityHeaders: emptySecurityHeaders(),
      techObservations: { server: null, poweredBy: null, poweredByCloudflare: false, cmsGuess: null },
      findings,
    };
  }

  const usedHttps = (finalUrl ?? target).startsWith("https:");
  if (!usedHttps) findings.push("Final URL is not served over HTTPS.");

  const headers = response.headers;
  const hsts = headers.get("strict-transport-security");
  const csp = headers.get("content-security-policy");
  const xfo = headers.get("x-frame-options");
  const xcto = headers.get("x-content-type-options");
  const rp = headers.get("referrer-policy");
  const pp = headers.get("permissions-policy");

  if (usedHttps && !hsts) findings.push("Missing Strict-Transport-Security header.");
  if (!csp) findings.push("Missing Content-Security-Policy header.");
  if (!xfo) findings.push("Missing X-Frame-Options header (clickjacking exposure).");
  if (!xcto) findings.push("Missing X-Content-Type-Options header.");

  const server = headers.get("server");
  const poweredBy = headers.get("x-powered-by");
  const poweredByCloudflare = Boolean(headers.get("cf-ray")) || (server ?? "").toLowerCase().includes("cloudflare");

  let bodySnippet = "";
  let cmsGuess: string | null = null;
  try {
    const text = await response.clone().text();
    bodySnippet = text.slice(0, 20000);
    cmsGuess = guessCms(headers, bodySnippet);
  } catch {
    // Body not readable (binary, huge, etc.) — non-fatal, skip CMS guess.
  }

  if (chain.length > 3) findings.push(`Redirect chain is ${chain.length} hops long — consider flattening.`);
  if (response.status >= 500) findings.push(`Origin returned a server error (${response.status}).`);
  if (response.status >= 400 && response.status < 500) findings.push(`Origin returned a client error (${response.status}).`);

  return {
    target,
    timestamp,
    http: {
      status: response.status,
      ok: response.ok,
      redirectChain: chain,
      finalUrl,
      error: null,
    },
    tls: {
      usedHttps,
      // Workers' fetch() does not expose raw TLS handshake details (cipher,
      // negotiated version) to userland — only that the connection succeeded
      // over https. A deeper TLS audit needs a raw socket check outside the
      // Workers runtime; flagged here rather than faked.
      protocol: usedHttps ? "TLS (negotiated version not exposed by Workers fetch())" : null,
    },
    dns: {
      hasA: null,
      hasAAAA: null,
      hasMX: null,
      hasTXT: null,
      note: "DNS record checks require DNS-over-HTTPS lookups (e.g. Cloudflare 1.1.1.1) — not yet wired into this build.",
    },
    securityHeaders: {
      strictTransportSecurity: hsts,
      contentSecurityPolicy: csp,
      xFrameOptions: xfo,
      xContentTypeOptions: xcto,
      referrerPolicy: rp,
      permissionsPolicy: pp,
    },
    techObservations: {
      server,
      poweredBy,
      poweredByCloudflare,
      cmsGuess,
    },
    findings,
  };
}

function emptyDns() {
  return { hasA: null, hasAAAA: null, hasMX: null, hasTXT: null, note: "not evaluated" };
}
function emptySecurityHeaders() {
  return {
    strictTransportSecurity: null,
    contentSecurityPolicy: null,
    xFrameOptions: null,
    xContentTypeOptions: null,
    referrerPolicy: null,
    permissionsPolicy: null,
  };
}
function emptySnapshot(target: string, timestamp: string, error: string): SecuritySnapshot {
  return {
    target,
    timestamp,
    http: { status: null, ok: false, redirectChain: [], finalUrl: null, error },
    tls: { usedHttps: false, protocol: null },
    dns: emptyDns(),
    securityHeaders: emptySecurityHeaders(),
    techObservations: { server: null, poweredBy: null, poweredByCloudflare: false, cmsGuess: null },
    findings: [error],
  };
}

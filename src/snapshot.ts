/**
 * Qzenta Website Security Snapshot — core scan logic.
 *
 * Non-invasive, read-only checks only: no auth bypass attempts, no
 * vulnerability exploitation, no brute forcing. Everything here is
 * information a normal HTTP client sees on a single GET request.
 */

import { checkHostnameAllowed, fetchWithTimeout } from "./ssrf-guard";
import { checkDnsRecords, type DnsCheckResult } from "./dns-check";
import { probeTls, type TlsProbeResult } from "./tls-probe";
import { scoreSecurityHeaders, type HeaderScore } from "./header-scoring";
import { buildVerdict, type Verdict } from "./verdict";

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
    cipherSuite: string | null;
    cipherSuiteId: string | null;
    weakCipher: boolean;
    probeError: string | null;
  };
  dns: DnsCheckResult;
  securityHeaders: {
    strictTransportSecurity: string | null;
    contentSecurityPolicy: string | null;
    xFrameOptions: string | null;
    xContentTypeOptions: string | null;
    referrerPolicy: string | null;
    permissionsPolicy: string | null;
  };
  headerScore: HeaderScore;
  techObservations: {
    server: string | null;
    poweredBy: string | null;
    poweredByCloudflare: boolean;
    cmsGuess: string | null;
  };
  findings: string[];
  verdict: Verdict;
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
    const httpError = error ?? "unknown error";
    findings.push(`Request failed: ${httpError}`);
    const headerScore = scoreSecurityHeaders({
      usedHttps: false,
      strictTransportSecurity: null,
      contentSecurityPolicy: null,
      xFrameOptions: null,
      xContentTypeOptions: null,
      referrerPolicy: null,
      permissionsPolicy: null,
    });
    const tlsResult: TlsProbeResult = { version: null, cipherSuite: null, cipherSuiteId: null, weak: false, error: null };
    return {
      target,
      timestamp,
      http: { status: null, ok: false, redirectChain: chain, finalUrl, error: httpError },
      tls: { usedHttps: false, protocol: null, cipherSuite: null, cipherSuiteId: null, weakCipher: false, probeError: null },
      dns: emptyDns(),
      securityHeaders: emptySecurityHeaders(),
      headerScore,
      techObservations: { server: null, poweredBy: null, poweredByCloudflare: false, cmsGuess: null },
      findings,
      verdict: buildVerdict({ httpOk: false, httpError, usedHttps: false, headerScore, tls: tlsResult }),
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

  const targetHostname = new URL(finalUrl ?? target).hostname;
  const [dns, tls] = await Promise.all([
    checkDnsRecords(targetHostname),
    usedHttps ? probeTls(targetHostname) : Promise.resolve<TlsProbeResult>({
      version: null,
      cipherSuite: null,
      cipherSuiteId: null,
      weak: false,
      error: "skipped — target is not served over HTTPS",
    }),
  ]);

  if (tls.error && usedHttps) findings.push(`TLS probe: ${tls.error}`);
  if (tls.weak) findings.push(`TLS cipher suite is weak/legacy: ${tls.cipherSuite ?? tls.cipherSuiteId}.`);

  if (chain.length > 3) findings.push(`Redirect chain is ${chain.length} hops long — consider flattening.`);
  if (response.status >= 500) findings.push(`Origin returned a server error (${response.status}).`);
  if (response.status >= 400 && response.status < 500) findings.push(`Origin returned a client error (${response.status}).`);

  const headerScore = scoreSecurityHeaders({
    usedHttps,
    strictTransportSecurity: hsts,
    contentSecurityPolicy: csp,
    xFrameOptions: xfo,
    xContentTypeOptions: xcto,
    referrerPolicy: rp,
    permissionsPolicy: pp,
  });
  for (const issue of headerScore.issues) {
    findings.push(`[${issue.severity}] ${issue.header}: ${issue.message}`);
  }

  const verdict = buildVerdict({
    httpOk: response.ok,
    httpError: null,
    usedHttps,
    headerScore,
    tls,
  });

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
      protocol: tls.version ?? (usedHttps ? "unknown (TLS probe did not resolve a version)" : null),
      cipherSuite: tls.cipherSuite,
      cipherSuiteId: tls.cipherSuiteId,
      weakCipher: tls.weak,
      probeError: tls.error,
    },
    dns,
    securityHeaders: {
      strictTransportSecurity: hsts,
      contentSecurityPolicy: csp,
      xFrameOptions: xfo,
      xContentTypeOptions: xcto,
      referrerPolicy: rp,
      permissionsPolicy: pp,
    },
    headerScore,
    techObservations: {
      server,
      poweredBy,
      poweredByCloudflare,
      cmsGuess,
    },
    findings,
    verdict,
  };
}

function emptyDns(): DnsCheckResult {
  return {
    hasA: false,
    hasAAAA: false,
    hasMX: false,
    hasTXT: false,
    records: { A: [], AAAA: [], MX: [], TXT: [] },
    note: "not evaluated",
  };
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
  const headerScore = scoreSecurityHeaders({
    usedHttps: false,
    strictTransportSecurity: null,
    contentSecurityPolicy: null,
    xFrameOptions: null,
    xContentTypeOptions: null,
    referrerPolicy: null,
    permissionsPolicy: null,
  });
  const tls: TlsProbeResult = { version: null, cipherSuite: null, cipherSuiteId: null, weak: false, error: null };
  return {
    target,
    timestamp,
    http: { status: null, ok: false, redirectChain: [], finalUrl: null, error },
    tls: { usedHttps: false, protocol: null, cipherSuite: null, cipherSuiteId: null, weakCipher: false, probeError: null },
    dns: emptyDns(),
    securityHeaders: emptySecurityHeaders(),
    headerScore,
    techObservations: { server: null, poweredBy: null, poweredByCloudflare: false, cmsGuess: null },
    findings: [error],
    verdict: buildVerdict({ httpOk: false, httpError: error, usedHttps: false, headerScore, tls }),
  };
}

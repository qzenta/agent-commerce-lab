/**
 * Security header MISCONFIGURATION scoring — the real differentiator from
 * every competitor found in market research, which only checks presence vs
 * absence. A header can be present and still be badly configured (CSP with
 * `unsafe-inline`, HSTS with a trivial max-age, X-Frame-Options with a bogus
 * value) — that's worse than not knowing, because it looks compliant on a
 * shallow scan while actually providing weak protection.
 */

export interface HeaderIssue {
  header: string;
  severity: "high" | "medium" | "low";
  message: string;
}

export interface HeaderScore {
  score: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  issues: HeaderIssue[];
}

const MIN_RECOMMENDED_HSTS_MAX_AGE = 15552000; // 180 days, the common minimum recommendation

function scoreHsts(usedHttps: boolean, value: string | null, issues: HeaderIssue[]): number {
  if (!usedHttps) return 0; // HSTS is meaningless without HTTPS in the first place
  if (!value) {
    issues.push({ header: "Strict-Transport-Security", severity: "high", message: "Missing entirely on an HTTPS site." });
    return 0;
  }
  let points = 10;
  const maxAgeMatch = value.match(/max-age\s*=\s*(\d+)/i);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
  if (!maxAgeMatch || maxAge === 0) {
    issues.push({ header: "Strict-Transport-Security", severity: "high", message: "Present but max-age is missing or 0 — provides no real protection." });
    points -= 8;
  } else if (maxAge < MIN_RECOMMENDED_HSTS_MAX_AGE) {
    issues.push({
      header: "Strict-Transport-Security",
      severity: "medium",
      message: `max-age=${maxAge} is below the recommended ${MIN_RECOMMENDED_HSTS_MAX_AGE} (180 days).`,
    });
    points -= 3;
  }
  if (!/includesubdomains/i.test(value)) {
    issues.push({ header: "Strict-Transport-Security", severity: "low", message: "Missing includeSubDomains — subdomains aren't covered." });
    points -= 1;
  }
  return Math.max(0, points);
}

function scoreCsp(value: string | null, issues: HeaderIssue[]): number {
  if (!value) {
    issues.push({ header: "Content-Security-Policy", severity: "high", message: "Missing entirely — no defense-in-depth against XSS/injection." });
    return 0;
  }
  let points = 20;
  if (/unsafe-inline/i.test(value)) {
    issues.push({ header: "Content-Security-Policy", severity: "high", message: "Allows 'unsafe-inline' — defeats most of CSP's XSS protection." });
    points -= 10;
  }
  if (/unsafe-eval/i.test(value)) {
    issues.push({ header: "Content-Security-Policy", severity: "high", message: "Allows 'unsafe-eval' — permits dynamic code execution." });
    points -= 6;
  }
  if (/(^|[\s;])default-src[^;]*\*/i.test(value) || /(^|[\s;])script-src[^;]*\*(?!\S)/i.test(value)) {
    issues.push({ header: "Content-Security-Policy", severity: "medium", message: "Wildcard (*) source found — overly permissive." });
    points -= 4;
  }
  if (!/frame-ancestors/i.test(value)) {
    issues.push({ header: "Content-Security-Policy", severity: "low", message: "No frame-ancestors directive — relying on X-Frame-Options alone for clickjacking defense." });
    points -= 1;
  }
  return Math.max(0, points);
}

function scoreXfo(value: string | null, issues: HeaderIssue[]): number {
  if (!value) {
    issues.push({ header: "X-Frame-Options", severity: "medium", message: "Missing — clickjacking exposure (unless CSP frame-ancestors covers it)." });
    return 0;
  }
  const v = value.trim().toUpperCase();
  if (v === "DENY" || v === "SAMEORIGIN") return 10;
  if (v.startsWith("ALLOW-FROM")) {
    issues.push({ header: "X-Frame-Options", severity: "low", message: "Uses deprecated ALLOW-FROM syntax, unsupported by modern browsers — behaves as if the header were absent in Chrome/Firefox/Edge." });
    return 2;
  }
  issues.push({ header: "X-Frame-Options", severity: "medium", message: `Unrecognized value "${value}" — browsers may ignore it entirely.` });
  return 0;
}

function scoreXcto(value: string | null, issues: HeaderIssue[]): number {
  if (!value) {
    issues.push({ header: "X-Content-Type-Options", severity: "low", message: "Missing — allows MIME-sniffing." });
    return 0;
  }
  if (value.trim().toLowerCase() !== "nosniff") {
    issues.push({ header: "X-Content-Type-Options", severity: "low", message: `Present but value is "${value}", not "nosniff" — has no effect.` });
    return 0;
  }
  return 5;
}

function scoreReferrerPolicy(value: string | null, issues: HeaderIssue[]): number {
  if (!value) {
    issues.push({ header: "Referrer-Policy", severity: "low", message: "Missing — defaults to the browser's own policy (often leaks full referrer to third parties)." });
    return 0;
  }
  const permissive = ["unsafe-url", "no-referrer-when-downgrade"];
  if (permissive.includes(value.trim().toLowerCase())) {
    issues.push({ header: "Referrer-Policy", severity: "medium", message: `Set to "${value}" — leaks the full URL (including any query-string secrets/tokens) to third-party destinations.` });
    return 2;
  }
  return 5;
}

function scorePermissionsPolicy(value: string | null, issues: HeaderIssue[]): number {
  if (!value) {
    issues.push({ header: "Permissions-Policy", severity: "low", message: "Missing — browser features (camera, mic, geolocation, etc.) are left at default, not explicitly locked down." });
    return 0;
  }
  return 5;
}

export function scoreSecurityHeaders(input: {
  usedHttps: boolean;
  strictTransportSecurity: string | null;
  contentSecurityPolicy: string | null;
  xFrameOptions: string | null;
  xContentTypeOptions: string | null;
  referrerPolicy: string | null;
  permissionsPolicy: string | null;
}): HeaderScore {
  const issues: HeaderIssue[] = [];

  const points =
    scoreHsts(input.usedHttps, input.strictTransportSecurity, issues) +
    scoreCsp(input.contentSecurityPolicy, issues) +
    scoreXfo(input.xFrameOptions, issues) +
    scoreXcto(input.xContentTypeOptions, issues) +
    scoreReferrerPolicy(input.referrerPolicy, issues) +
    scorePermissionsPolicy(input.permissionsPolicy, issues);

  // Max achievable: HSTS 10 + CSP 20 + XFO 10 + XCTO 5 + Referrer 5 + Permissions 5 = 55
  const score = Math.round((points / 55) * 100);

  let grade: HeaderScore["grade"];
  if (score >= 90) grade = "A";
  else if (score >= 75) grade = "B";
  else if (score >= 55) grade = "C";
  else if (score >= 35) grade = "D";
  else grade = "F";

  // Highest severity first, so an LLM (or a human) reading top-to-bottom sees what matters most.
  const severityRank: Record<HeaderIssue["severity"], number> = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return { score, grade, issues };
}

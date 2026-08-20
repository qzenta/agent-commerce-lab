/**
 * Content-accuracy dimension (SiteHealth Passport v2, Gate 1-approved design).
 *
 * Site-scoped, opt-in sub-scan layered on runSecuritySnapshot(): after the base
 * snapshot completes, a bounded crawl (target page + up to CONTENT_MAX_PAGES-1
 * same-origin pages) extracts regulatory-figure claims from each page, compares
 * them against the human-approved ground-truth store, and detects cross-page
 * contradictions. Fully deterministic: regex-based extraction (no LLM/Ollama
 * anywhere — Handoff §5), pure classification, and a total scoring function.
 *
 * Finding severity vocabulary is critical/material/informational (matching the
 * comparator's materiality tiers); header issues keep their own high/medium/low.
 *
 * Gate 1 ruling D4: any finding with severity=critical whose fact's impact_class
 * is money or compliance-deadline caps content.score at <=35 (applied AFTER the
 * point deductions), forcing dimension status FAIL regardless of other scores.
 */

import { checkHostnameAllowed } from "./ssrf-guard";
import type { GroundTruthFact, FactPattern, ImpactClass } from "./ground-truth";

export const CONTENT_MAX_PAGES = 10;
export const CONTENT_FETCH_TIMEOUT_MS = 8000;
export const CONTENT_MAX_REDIRECTS = 3;

export type ContentFindingType =
  | "figure-mismatch"
  | "figure-stale"
  | "cross-page-contradiction"
  | "absent-required-figure";

export type ContentSeverity = "critical" | "material" | "informational";
export type ContentConfidence = "high" | "medium" | "low";
export type ContentStatus = "PASS" | "WARN" | "FAIL";

export interface ContentFinding {
  type: ContentFindingType;
  factKey: string;
  severity: ContentSeverity;
  confidence: ContentConfidence;
  pagePath: string | null; // null for site-wide findings (contradiction)
  claim: string | null;
  groundTruth: string | null;
  supersededBy: string | null; // set on figure-stale: the current approved value
  message: string;
}

export interface ContentScope {
  pagesScanned: number;
  pagesPlanned: number;
  sitemapFound: boolean;
  truncated: boolean;
}

/** Per-fact observation carried into the snapshot so the comparator can
 *  materiality-rate content changes without a ground-truth lookup. */
export interface ContentFactObservation {
  claims: string[]; // normalized claim values seen across pages
  pages: string[]; // page paths where claims were seen
  impact: ImpactClass;
}

export interface ContentResult {
  scope: ContentScope;
  facts: Record<string, ContentFactObservation>;
  findings: ContentFinding[];
  score: number; // 0-100 (D4-capped)
  grade: "A" | "B" | "C" | "D" | "F";
  status: ContentStatus;
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract same-origin http(s) hrefs from raw HTML (used when no sitemap exists). */
export function extractInternalLinks(html: string, origin: URL): string[] {
  const out: string[] = [];
  const re = /href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const resolved = new URL(m[1], origin).toString();
      const u = new URL(resolved);
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      if (u.hostname.toLowerCase() !== origin.hostname.toLowerCase()) continue;
      out.push(resolved);
    } catch {
      // unparseable href — skip
    }
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------
// Normalization (deterministic; the tricky ZA number/date formats live here)
// ---------------------------------------------------------------------------

/** "R2.3m" -> "2300000"; "R 2,3 million" -> "2300000"; "R2,300,000" -> "2300000";
 *  "R120 000" -> "120000"; "R1 476" -> "1476". Returns null when not a money expr. */
export function normalizeMoney(raw: string): string | null {
  let s = raw.trim().replace(/^R\s*/i, "");
  let multiplier = 1;
  const mult = s.match(/(m|million|k|thousand|b|billion)$/i);
  if (mult) {
    const m = mult[1].toLowerCase();
    if (m === "m" || m === "million") multiplier = 1_000_000;
    else if (m === "k" || m === "thousand") multiplier = 1_000;
    else if (m === "b" || m === "billion") multiplier = 1_000_000_000;
    s = s.slice(0, mult.index).trim();
  }
  s = s.replace(/\s+/g, "");
  // Decimal comma ("2,3" -> "2.3") BEFORE stripping commas as separators.
  s = s.replace(/^(\d+),(\d{1,2})$/, "$1.$2");
  s = s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return String(Math.round(n * multiplier));
}

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

/** "30 June" / "30th June" / "June 30" -> "06-30". Returns null when not a date expr. */
export function normalizeMonthDay(raw: string): string | null {
  const s = raw.trim();
  const m =
    s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+)/i) ??
    s.match(/([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?/i);
  if (!m) return null;
  const firstIsDay = /^\d/.test(m[1]);
  const day = firstIsDay ? m[1] : m[2];
  const monthName = firstIsDay ? m[2] : m[1];
  const monthNum = MONTHS[monthName.toLowerCase()];
  if (!monthNum) return null;
  const d = day.padStart(2, "0");
  if (Number(d) < 1 || Number(d) > 31) return null;
  return `${monthNum}-${d}`;
}

// ---------------------------------------------------------------------------
// Claim extraction
// ---------------------------------------------------------------------------

export interface RawClaim {
  factKey: string;
  raw: string;
  normalized: string;
  kind: "value" | "context";
  pagePath: string;
}

function isMoneyFact(fact: GroundTruthFact): boolean {
  return (fact.unit ?? "").toLowerCase().includes("zar");
}

/**
 * Runs every pattern for every fact over a page's text. Value patterns match a
 * known figure directly; context patterns are keyword-windowed captures (the
 * regex must expose the money/date expression as capture group 1, which is used
 * for normalization when present).
 */
export function extractClaimsFromText(
  text: string,
  pagePath: string,
  facts: GroundTruthFact[],
  patterns: FactPattern[]
): RawClaim[] {
  const byFact = new Map<string, FactPattern[]>();
  for (const p of patterns) {
    const arr = byFact.get(p.factKey) ?? [];
    arr.push(p);
    byFact.set(p.factKey, arr);
  }
  const claims: RawClaim[] = [];
  for (const [factKey, pats] of byFact) {
    const fact = facts.find((f) => f.factKey === factKey);
    if (!fact) continue;
    const money = isMoneyFact(fact);
    for (const p of pats) {
      if (p.kind === "keyword") continue; // keywords are topic markers, not claims
      let re: RegExp;
      try {
        re = new RegExp(p.pattern, "gi");
      } catch {
        continue; // a broken pattern must never take the scan down
      }
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const raw = m[1] ?? m[0];
        const normalized = money ? normalizeMoney(raw) : normalizeMonthDay(raw);
        if (normalized === null) continue;
        claims.push({ factKey, raw, normalized, kind: p.kind, pagePath });
        if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width loops
      }
    }
  }
  return claims;
}

/** Does any keyword pattern for `factKey` appear in the page text? */
export function topicPresentOnPage(
  text: string,
  factKey: string,
  patterns: FactPattern[]
): boolean {
  for (const p of patterns) {
    if (p.kind !== "keyword" || p.factKey !== factKey) continue;
    try {
      if (new RegExp(p.pattern, "i").test(text)) return true;
    } catch {
      // broken keyword pattern — ignore
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export interface PageContent {
  pagePath: string;
  text: string;
  claims: RawClaim[];
}

export function severityForImpact(impact: ImpactClass): ContentSeverity {
  if (impact === "money" || impact === "compliance-deadline") return "critical";
  if (impact === "compliance-threshold") return "material";
  return "informational";
}

export function confidenceFor(
  sourceTier: number,
  exact: boolean,
  ambiguous: boolean
): ContentConfidence {
  if (ambiguous) return "low";
  if (sourceTier <= 2 && exact) return "high";
  if (sourceTier === 3) return "medium";
  return "low";
}

/**
 * Pure classification: pages -> findings + per-fact observations.
 * - figure-mismatch: a context/value claim whose normalized value differs from
 *   the approved current value for that fact.
 * - figure-stale: a claim matching a superseded value (requires a superseded row;
 *   none are seeded in P0 — the machinery is proven by tests).
 * - cross-page-contradiction: >=2 distinct normalized values for one fact across
 *   the scanned pages.
 * - absent-required-figure: a money/compliance-deadline fact's topic appears on a
 *   page but no claim for that fact was found there.
 */
export function classifyPages(
  pages: PageContent[],
  facts: GroundTruthFact[], // active facts (current ground truth)
  superseded: GroundTruthFact[], // superseded rows (may be empty)
  patterns: FactPattern[],
  asOf: string
): { findings: ContentFinding[]; facts: Record<string, ContentFactObservation> } {
  const findings: ContentFinding[] = [];
  const observations: Record<string, ContentFactObservation> = {};

  for (const fact of facts) {
    const supersededValues = new Set(
      superseded
        .filter((s) => s.factKey === fact.factKey && s.appliesUntil !== null && s.appliesUntil <= asOf)
        .map((s) => s.value)
    );
    // claims per page (deduped by normalized value within a page)
    const claimsByPage = new Map<string, Set<string>>();
    const allClaimValues = new Set<string>();
    for (const page of pages) {
      const seen = new Set<string>();
      for (const c of page.claims) {
        if (c.factKey !== fact.factKey) continue;
        seen.add(c.normalized);
        allClaimValues.add(c.normalized);
      }
      if (seen.size > 0) claimsByPage.set(page.pagePath, seen);
    }

    const pagePaths = [...claimsByPage.keys()];
    observations[fact.factKey] = {
      claims: [...allClaimValues],
      pages: pagePaths,
      impact: fact.impactClass,
    };

    // Cross-page contradiction (site-wide).
    if (allClaimValues.size >= 2) {
      const severity = severityForImpact(fact.impactClass);
      findings.push({
        type: "cross-page-contradiction",
        factKey: fact.factKey,
        severity,
        confidence: fact.sourceTier <= 2 ? "high" : "medium",
        pagePath: null,
        claim: [...allClaimValues].join(" / "),
        groundTruth: fact.value,
        supersededBy: null,
        message:
          `Pages of this site state different values for "${fact.label}": ` +
          `[${[...allClaimValues].join(", ")}] (approved value ${fact.value}).`,
      });
    }

    // Per-page figure checks.
    for (const page of pages) {
      const pageClaims = claimsByPage.get(page.pagePath);
      const hasClaim = pageClaims !== undefined && pageClaims.size > 0;
      const topic = topicPresentOnPage(page.text, fact.factKey, patterns);

      if (hasClaim) {
        for (const value of pageClaims) {
          if (value === fact.value) continue; // correct claim
          if (supersededValues.has(value)) {
            findings.push({
              type: "figure-stale",
              factKey: fact.factKey,
              severity: severityForImpact(fact.impactClass),
              confidence: confidenceFor(fact.sourceTier, true, false),
              pagePath: page.pagePath,
              claim: value,
              groundTruth: value,
              supersededBy: fact.value,
              message:
                `"${fact.label}" stated as ${formatValue(value)} on ${page.pagePath}; ` +
                `superseded — the approved value since ${fact.appliesFrom} is ${formatValue(fact.value)}.`,
            });
          } else {
            findings.push({
              type: "figure-mismatch",
              factKey: fact.factKey,
              severity: severityForImpact(fact.impactClass),
              confidence: confidenceFor(fact.sourceTier, true, false),
              pagePath: page.pagePath,
              claim: value,
              groundTruth: fact.value,
              supersededBy: null,
              message:
                `"${fact.label}" stated as ${formatValue(value)} on ${page.pagePath}; ` +
                `approved value is ${formatValue(fact.value)} (effective ${fact.appliesFrom}).`,
            });
          }
        }
      } else if (topic && (fact.impactClass === "money" || fact.impactClass === "compliance-deadline")) {
        findings.push({
          type: "absent-required-figure",
          factKey: fact.factKey,
          severity: "informational",
          confidence: "low",
          pagePath: page.pagePath,
          claim: null,
          groundTruth: fact.value,
          supersededBy: null,
          message:
            `"${fact.label}" topic appears on ${page.pagePath} but no figure for it was found there.`,
        });
      }
    }
  }

  return { findings, facts: observations };
}

function formatValue(value: string): string {
  return value;
}

// ---------------------------------------------------------------------------
// Scoring (Gate 1 D4: hard cap on critical money/deadline findings)
// ---------------------------------------------------------------------------

export function scoreContent(
  facts: GroundTruthFact[],
  findings: ContentFinding[]
): { score: number; grade: "A" | "B" | "C" | "D" | "F"; status: ContentStatus } {
  let score = 100;
  for (const f of findings) {
    if (f.severity === "critical") score -= 30;
    else if (f.severity === "material") score -= 15;
    else score -= 5;
  }
  score = Math.max(0, score);

  // D4 hard cap — independent of the point deduction:
  // any critical finding on a money/compliance-deadline fact caps the sub-score
  // at <=35, which forces dimension status FAIL below (status rule, not just the
  // -30 deduction absorbing into a WARN on an otherwise-clean site).
  const hasCriticalMoneyOrDeadline = findings.some((f) => {
    if (f.severity !== "critical") return false;
    const fact = facts.find((x) => x.factKey === f.factKey);
    return fact !== undefined && (fact.impactClass === "money" || fact.impactClass === "compliance-deadline");
  });
  if (hasCriticalMoneyOrDeadline) score = Math.min(score, 35);

  let grade: "A" | "B" | "C" | "D" | "F";
  if (score >= 90) grade = "A";
  else if (score >= 75) grade = "B";
  else if (score >= 55) grade = "C";
  else if (score >= 35) grade = "D";
  else grade = "F";

  const hasMaterialOrWorse = findings.some((f) => f.severity === "critical" || f.severity === "material");
  let status: ContentStatus;
  if (score < 40) status = "FAIL";
  else if (score >= 75 && !hasMaterialOrWorse) status = "PASS";
  else status = "WARN";

  return { score, grade, status };
}

// ---------------------------------------------------------------------------
// Orchestration (guarded fetch + discovery + pipeline)
// ---------------------------------------------------------------------------

export interface FetchedPage {
  pagePath: string;
  html: string;
  text: string;
  ok: boolean;
  finalUrl: string;
}

/** Canonical dedupe key: protocol + lowercased host + normalized pathname
 *  (search/hash dropped; trailing slash stripped except for the root path). */
export function canonicalPageKey(url: string): string {
  const u = new URL(url);
  let path = u.pathname === "/" ? "/" : u.pathname.replace(/\/+$/, "");
  return `${u.protocol}//${u.hostname.toLowerCase()}${path}`;
}

/** SSRF-guarded fetch with a bounded redirect loop and per-hop host validation. */
export async function fetchPageText(
  url: string,
  fetchFn: typeof fetch,
  timeoutMs = CONTENT_FETCH_TIMEOUT_MS
): Promise<{ html: string; finalUrl: string; error: string | null }> {
  let current = url;
  let error: string | null = null;
  for (let hop = 0; hop <= CONTENT_MAX_REDIRECTS; hop++) {
    const hostname = new URL(current).hostname;
    const hostCheck = await checkHostnameAllowed(hostname, fetchFn);
    if (hostCheck.blocked) {
      return { html: "", finalUrl: current, error: `blocked by SSRF guard: ${hostCheck.reason}` };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(current, { redirect: "manual", signal: controller.signal });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) return { html: "", finalUrl: current, error: "redirect without location" };
        current = new URL(location, current).toString();
        continue;
      }
      const html = await res.text();
      return { html, finalUrl: current, error: null };
    } catch (err) {
      error = err instanceof Error ? err.message : "fetch failed";
      return { html: "", finalUrl: current, error };
    } finally {
      clearTimeout(timer);
    }
  }
  return { html: "", finalUrl: current, error: error ?? "too many redirects" };
}

/** Sitemap URLs (same-origin only) from /sitemap.xml — no XML parser dependency. */
export function parseSitemapUrls(xml: string, origin: URL): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    try {
      const u = new URL(m[1].trim());
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      if (u.hostname.toLowerCase() !== origin.hostname.toLowerCase()) continue;
      out.push(u.toString());
    } catch {
      // unparseable loc — skip
    }
  }
  return [...new Set(out)];
}

export interface ContentCheckInput {
  originUrl: string; // final (post-redirect) URL of the scanned target
  fetchFn: typeof fetch;
  facts: GroundTruthFact[]; // active facts
  superseded: GroundTruthFact[]; // superseded rows (may be empty)
  patterns: FactPattern[];
  maxPages?: number;
  asOf: string; // YYYY-MM-DD
}

/**
 * Runs the bounded site crawl + figure checks. The target page is always the
 * first page; discovery then adds up to maxPages-1 same-origin pages from
 * /sitemap.xml (fallback: internal links in the target HTML).
 */
export async function runContentCheck(input: ContentCheckInput): Promise<ContentResult> {
  const maxPages = input.maxPages ?? CONTENT_MAX_PAGES;
  const target = await fetchPageText(input.originUrl, input.fetchFn);

  // The target may have redirected — discovery is anchored on the FINAL origin
  // so same-origin filtering and the sitemap URL reflect the real host.
  const finalOrigin = new URL(target.finalUrl);

  const targetPath = finalOrigin.pathname === "/" ? "/" : finalOrigin.pathname;
  const pages: FetchedPage[] = [
    { pagePath: targetPath, html: target.html, text: htmlToText(target.html), ok: target.error === null, finalUrl: target.finalUrl },
  ];

  // 2. Discovery: sitemap, else internal links from the target HTML.
  let sitemapFound = false;
  let discovered: string[] = [];
  const sitemapUrl = `${finalOrigin.origin}/sitemap.xml`;
  const sitemapRes = await fetchPageText(sitemapUrl, input.fetchFn);
  if (sitemapRes.error === null && /<loc>/i.test(sitemapRes.html)) {
    sitemapFound = true;
    discovered = parseSitemapUrls(sitemapRes.html, finalOrigin);
  } else {
    discovered = extractInternalLinks(target.html, finalOrigin);
  }
  const slots = Math.max(0, maxPages - 1);
  const planned = discovered.slice(0, slots);
  const truncated = discovered.length > slots;

  // 3. Fetch remaining pages in parallel (bounded fan-out; SSRF-guarded per hop).
  const rest = await Promise.all(
    planned.map(async (url) => {
      const fetched = await fetchPageText(url, input.fetchFn);
      const u = new URL(fetched.finalUrl);
      const path = u.pathname === "/" ? "/" : u.pathname;
      return { pagePath: path, html: fetched.html, text: htmlToText(fetched.html), ok: fetched.error === null, finalUrl: fetched.finalUrl };
    })
  );
  pages.push(...rest);

  // 3b. Dedupe by canonical final URL — the target page may also appear in the
  // sitemap (or be re-discovered via internal links); scanning it twice would
  // duplicate every finding for that page. First occurrence (the target) wins.
  const seen = new Set<string>();
  const deduped: FetchedPage[] = [];
  for (const p of pages) {
    const key = canonicalPageKey(p.finalUrl);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
  }

  const scanned = deduped.filter((p) => p.ok);
  const pageContents: PageContent[] = scanned.map((p) => ({
    pagePath: p.pagePath,
    text: p.text,
    claims: extractClaimsFromText(p.text, p.pagePath, input.facts, input.patterns),
  }));

  // 4. Classify + score.
  const { findings, facts: observations } = classifyPages(pageContents, input.facts, input.superseded, input.patterns, input.asOf);
  let { score, grade, status } = scoreContent(input.facts, findings);

  // A content scan that could not read ANY page must not report a clean PASS.
  if (scanned.length === 0) {
    score = 0;
    grade = "F";
    status = "FAIL";
  }

  return {
    scope: {
      pagesScanned: scanned.length,
      pagesPlanned: Math.min(maxPages, 1 + planned.length),
      sitemapFound,
      truncated,
    },
    facts: observations,
    findings,
    score,
    grade,
    status,
  };
}

/**
 * LLM-consumable pass/fail verdict — the second real differentiator from
 * market research. Most competitors return raw JSON only and leave the
 * calling agent to interpret it; this collapses the snapshot into a single
 * field an agent can act on without a second reasoning pass.
 */

import type { HeaderScore } from "./header-scoring";
import type { TlsProbeResult } from "./tls-probe";

export type VerdictStatus = "PASS" | "WARN" | "FAIL";

export interface Verdict {
  status: VerdictStatus;
  score: number; // 0-100, same scale as headerScore for consistency
  summary: string;
  topIssues: string[];
}

export function buildVerdict(input: {
  httpOk: boolean;
  httpError: string | null;
  usedHttps: boolean;
  headerScore: HeaderScore;
  tls: TlsProbeResult;
}): Verdict {
  const topIssues: string[] = [];

  if (input.httpError) {
    return {
      status: "FAIL",
      score: 0,
      summary: `Target unreachable: ${input.httpError}`,
      topIssues: [input.httpError],
    };
  }

  if (!input.usedHttps) {
    topIssues.push("Site is not served over HTTPS.");
  }
  if (input.tls.weak) {
    topIssues.push(`TLS cipher suite is weak/legacy (${input.tls.cipherSuite ?? input.tls.cipherSuiteId}).`);
  }

  for (const issue of input.headerScore.issues) {
    if (issue.severity === "high") topIssues.push(`${issue.header}: ${issue.message}`);
  }
  if (topIssues.length < 3) {
    for (const issue of input.headerScore.issues) {
      if (issue.severity === "medium" && !topIssues.some((t) => t.startsWith(issue.header))) {
        topIssues.push(`${issue.header}: ${issue.message}`);
      }
      if (topIssues.length >= 5) break;
    }
  }

  // Score blends header-config quality with hard pass/fail transport signals
  // (HTTPS presence, weak cipher) — a perfect header score on a plaintext
  // HTTP site should not read as healthy.
  let score = input.headerScore.score;
  if (!input.usedHttps) score = Math.min(score, 20);
  if (input.tls.weak) score = Math.min(score, 60);
  if (!input.httpOk) score = Math.min(score, 40);

  let status: VerdictStatus;
  if (score >= 75 && topIssues.length === 0) status = "PASS";
  else if (score >= 40) status = "WARN";
  else status = "FAIL";

  const summary =
    status === "PASS"
      ? `No material security issues found. Header grade ${input.headerScore.grade} (${input.headerScore.score}/100).`
      : `${topIssues.length} issue${topIssues.length === 1 ? "" : "s"} found. Header grade ${input.headerScore.grade} (${input.headerScore.score}/100).`;

  return { status, score, summary, topIssues: topIssues.slice(0, 5) };
}

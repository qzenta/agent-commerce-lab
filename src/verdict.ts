/**
 * LLM-consumable pass/fail verdict — the second real differentiator from
 * market research. Most competitors return raw JSON only and leave the
 * calling agent to interpret it; this collapses the snapshot into a single
 * field an agent can act on without a second reasoning pass.
 *
 * v2 (Gate 2): the verdict is content-aware. The content dimension's sub-score
 * is already D4-capped by content-check.ts (any critical finding on a
 * money/compliance-deadline fact caps content.score at <=35 -> dimension FAIL);
 * the verdict blends via min(), so a capped content score forces the blended
 * score to <=35 (below the FAIL threshold) regardless of an otherwise-clean
 * site. Existing behavior is byte-identical when no content block is supplied.
 */

import type { HeaderScore } from "./header-scoring";
import type { TlsProbeResult } from "./tls-probe";
import type { ContentStatus } from "./content-check";

export type VerdictStatus = "PASS" | "WARN" | "FAIL";

export interface Verdict {
  status: VerdictStatus;
  score: number; // 0-100, same scale as headerScore for consistency
  summary: string;
  topIssues: string[];
}

export interface ContentVerdictInput {
  score: number; // content sub-score, already D4-capped by scoreContent
  grade: "A" | "B" | "C" | "D" | "F";
  status: ContentStatus;
  topFindings: string[]; // severity-sorted (critical first), human/LLM-readable
}

export function buildVerdict(input: {
  httpOk: boolean;
  httpError: string | null;
  usedHttps: boolean;
  headerScore: HeaderScore;
  tls: TlsProbeResult;
  content?: ContentVerdictInput;
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

  // Content dimension findings — appended after the header issues (already
  // severity-sorted critical-first inside content-check), then capped at 5.
  const contentTop = input.content?.topFindings ?? [];
  topIssues.push(...contentTop);

  // Score blends header-config quality with hard pass/fail transport signals
  // (HTTPS presence, weak cipher) — a perfect header score on a plaintext
  // HTTP site should not read as healthy.
  let score = input.headerScore.score;
  if (!input.usedHttps) score = Math.min(score, 20);
  if (input.tls.weak) score = Math.min(score, 60);
  if (!input.httpOk) score = Math.min(score, 40);
  // Content dimension: min() propagates the D4 cap (critical money/deadline
  // finding -> content.score <= 35 -> blended score <= 35 -> verdict FAIL).
  if (input.content) score = Math.min(score, input.content.score);

  let status: VerdictStatus;
  if (score >= 75 && topIssues.length === 0) status = "PASS";
  else if (score >= 40) status = "WARN";
  else status = "FAIL";

  const summary =
    input.content === undefined
      ? status === "PASS"
        ? `No material security issues found. Header grade ${input.headerScore.grade} (${input.headerScore.score}/100).`
        : `${topIssues.length} issue${topIssues.length === 1 ? "" : "s"} found. Header grade ${input.headerScore.grade} (${input.headerScore.score}/100).`
      : `${topIssues.length} issue${topIssues.length === 1 ? "" : "s"} found. Content grade ${input.content.grade} (${input.content.score}/100, ${input.content.status}); header grade ${input.headerScore.grade} (${input.headerScore.score}/100).`;

  return { status, score, summary, topIssues: topIssues.slice(0, 5) };
}

/**
 * Pilot report generation (Gate 4 P0): a per-domain Markdown digest built from
 * the stored history, changes, and the latest snapshot — the monthly digest /
 * evidence export capability. Pure function over already-loaded rows, so it is
 * unit-testable and provider-independent (no portal; the digest is served via
 * GET /report and can be emailed through the configured webhook).
 */

import type { SnapshotSummary, ChangeEntry } from "./history";
import type { ContentResult } from "./content-check";

export interface DigestInput {
  domain: string;
  generatedAt: string;
  latest: SnapshotSummary | null;
  content: Pick<ContentResult, "score" | "grade" | "status" | "scope" | "findings"> | null;
  changes: ChangeEntry[];
  historyCount: number;
}

export function buildDigest(input: DigestInput): string {
  const lines: string[] = [];
  lines.push(`# SiteHealth Passport — ${input.domain}`);
  lines.push(`_Generated ${input.generatedAt} UTC_`);
  lines.push("");

  if (!input.latest) {
    lines.push("No snapshots recorded for this domain yet.");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("## Current state");
  lines.push(`- Verdict: **${input.latest.verdictStatus}** (${input.latest.verdictScore}/100)`);
  if (input.content) {
    lines.push(
      `- Content accuracy: **${input.content.status}** (${input.content.score}/100, grade ${input.content.grade}, ${input.content.scope.pagesScanned} page(s) scanned)`
    );
  }
  lines.push(`- Security headers: grade ${input.latest.headerGrade} (${input.latest.headerScore}/100)`);
  lines.push(`- Snapshots recorded: ${input.historyCount}`);
  lines.push(`- Latest scan: ${input.latest.scannedAt}`);
  lines.push("");

  if (input.content && input.content.findings.length > 0) {
    lines.push(`## Content findings (latest scan)`);
    for (const f of input.content.findings) {
      const page = f.pagePath ? ` | page ${f.pagePath}` : "";
      lines.push(`- [${f.severity}] ${f.type} | ${f.factKey}${page} | claim ${f.claim ?? "—"} | ${f.message}`);
    }
    lines.push("");
  } else if (input.content) {
    lines.push("## Content findings (latest scan)");
    lines.push("- none");
    lines.push("");
  }

  if (input.changes.length > 0) {
    lines.push(`## Detected changes (latest ${input.changes.length})`);
    for (const c of input.changes) {
      const fields = c.changedFields.map((f) => `${f.field} (${f.materiality})`).join(", ");
      lines.push(
        `- ${c.detectedAt} [${c.materiality ?? "n/a"}] ${fields || "no fields"} | score delta ${c.scoreDelta ?? "n/a"} | verdict moved ${c.verdictMoved}`
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("*Evidence is reproducible via GET /history and GET /changes for this domain.*");
  lines.push("");
  return lines.join("\n");
}

/**
 * Batch/portfolio snapshot orchestration for POST /snapshot/batch.
 *
 * This module contains NO scan logic of its own. Every domain is scanned by
 * the existing runSecuritySnapshot() orchestrator, so SSRF guarding (per hop,
 * redirects re-validated), fetch timeouts, DNS checks, the TLS probe, header
 * scoring, and the LLM verdict are all inherited unchanged. This file only:
 * validates the request body, computes the per-domain price, bounds
 * concurrency and total wall-clock time, and shapes the { results: [...] }
 * envelope with per-item failure isolation.
 */

import { runSecuritySnapshot, type SecuritySnapshot } from "./snapshot";

export const BATCH_MIN_DOMAINS = 2;
export const BATCH_MAX_DOMAINS = 20;
export const BATCH_CONCURRENCY = 5;
export const BATCH_DEADLINE_MS = 30_000;
/** $0.01 per domain, expressed in USDC-dollar cents to avoid float error. */
export const BATCH_PRICE_CENTS_PER_DOMAIN = 1;

export interface BatchResultItem {
  domain: string;
  ok: boolean;
  snapshot?: SecuritySnapshot;
  error?: string;
}

export interface BatchResponse {
  results: BatchResultItem[];
}

/**
 * Renders the x402 price string for N domains, e.g. 2 -> "$0.02",
 * 20 -> "$0.20". Matches x402's money format (dollar-prefixed decimal).
 */
export function formatBatchPrice(domainCount: number): string {
  const cents = domainCount * BATCH_PRICE_CENTS_PER_DOMAIN;
  return `$${(cents / 100).toFixed(2)}`;
}

export type BatchBodyValidation =
  | { ok: true; domains: string[] }
  | { ok: false; error: string };

/**
 * Validates the POST /snapshot/batch request body. Enforces the 2-20 domain
 * range, string/arity/duplicate rules, and returns trimmed values. Any
 * failure is a request-level 400 issued BEFORE the payment gate runs.
 */
export function validateBatchDomains(body: unknown): BatchBodyValidation {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "request body must be a JSON object" };
  }
  const domains = (body as { domains?: unknown }).domains;
  if (!Array.isArray(domains)) {
    return { ok: false, error: "missing required field: domains (string[])" };
  }
  if (domains.length < BATCH_MIN_DOMAINS || domains.length > BATCH_MAX_DOMAINS) {
    return {
      ok: false,
      error: `domains must contain between ${BATCH_MIN_DOMAINS} and ${BATCH_MAX_DOMAINS} entries (got ${domains.length})`,
    };
  }
  if (domains.some((d) => typeof d !== "string" || d.trim().length === 0)) {
    return { ok: false, error: "every entry in domains must be a non-empty string" };
  }
  const trimmed = domains.map((d) => (d as string).trim());
  if (new Set(trimmed).size !== trimmed.length) {
    return { ok: false, error: "domains must not contain duplicates" };
  }
  return { ok: true, domains: trimmed };
}

/** Input-level URL check — same contract runSecuritySnapshot enforces. */
function parseHttpUrl(domain: string): { ok: true } | { ok: false; error: string } {
  try {
    const parsed = new URL(domain);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { ok: false, error: `invalid URL "${domain}": only http/https URLs are supported` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: `invalid URL "${domain}"` };
  }
}

async function scanOne(domain: string): Promise<BatchResultItem> {
  const urlCheck = parseHttpUrl(domain);
  if (!urlCheck.ok) {
    return { domain, ok: false, error: urlCheck.error };
  }
  try {
    const snapshot = await runSecuritySnapshot(domain);
    return { domain, ok: true, snapshot };
  } catch (err) {
    // runSecuritySnapshot is designed never to throw; this is a defensive
    // backstop so one unexpected failure can never sink the whole batch.
    return { domain, ok: false, error: err instanceof Error ? err.message : "snapshot failed" };
  }
}

/**
 * Runs a batch of snapshots with a fixed-size worker pool and a hard
 * wall-clock budget. Items that have not STARTED when the deadline passes are
 * reported as `error: "batch deadline exceeded"`; items already in flight run
 * to completion (each is individually time-boxed inside runSecuritySnapshot).
 * Results are always returned in request order, and no single failure rejects
 * the batch.
 */
export async function runBatchSnapshots(
  domains: string[],
  opts?: { concurrency?: number; deadlineMs?: number }
): Promise<BatchResponse> {
  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? BATCH_CONCURRENCY, domains.length));
  const deadlineMs = opts?.deadlineMs ?? BATCH_DEADLINE_MS;
  const deadline = Date.now() + deadlineMs;
  const results: BatchResultItem[] = new Array(domains.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= domains.length) return;
      if (Date.now() >= deadline) {
        results[index] = { domain: domains[index], ok: false, error: "batch deadline exceeded" };
        continue;
      }
      results[index] = await scanOne(domains[index]);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { results };
}

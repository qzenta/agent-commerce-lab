/**
 * Cycle 2 — Historical / change detection.
 *
 * Persistence + comparison pipeline layered ON TOP of the stateless
 * runSecuritySnapshot() pipeline. No scan logic lives here: this module
 * normalizes a SecuritySnapshot for D1 storage, computes a version-gated
 * structured-field diff against the most recent prior COMPLETE snapshot for
 * the same domain, and exposes indexed read paths for GET /history and
 * GET /changes. See the Cycle 2 package Sections C-F for the design contract.
 *
 * Design notes:
 * - Compare-on-write, synchronously, in the request (approved at Gate 0;
 *   latency evidence is a Gate 2 deliverable).
 * - Version gating: scoring_version mismatch is mandatory non-comparable;
 *   scanner_version mismatch is conservatively treated the same way (a
 *   field-level schema registry does not exist, so we cannot know which
 *   fields a scanner change affects).
 * - Partial/failed observations are STORED and VISIBLE in /history, but are
 *   never selected as a comparison anchor (Section F amendment).
 * - Only structured fields are diffed; findings[]/free text and redirect URL
 *   contents are never compared (Section D).
 */

import type { SecuritySnapshot } from "./snapshot";
import { SCANNER_VERSION, SCORING_VERSION } from "./versions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SnapshotStatus = "complete" | "partial" | "failed";
export type Materiality = "critical" | "material" | "informational";

export interface ChangedField {
  field: string;
  from: unknown;
  to: unknown;
  materiality: Materiality;
}

export interface CompareResult {
  comparable: boolean;
  reason: string;
  changedFields: ChangedField[];
  scoreDelta: number | null; // current.verdict.score - prior.verdict.score
  verdictMoved: boolean;
}

export interface SnapshotVersionMeta {
  id: number;
  scanned_at: string;
  scanner_version: string;
  scoring_version: string;
}

/** The `change` object appended to /snapshot/run?history=true responses. */
export interface ChangeResponse {
  comparable: boolean;
  reason: string;
  changedFields: ChangedField[];
  scoreDelta: number | null;
  verdictMoved: boolean;
  detectedAt: string;
  changeId?: number; // present when a changes row was written
  from: { snapshotId: number; scannedAt: string; scannerVersion: string; scoringVersion: string } | null;
  to: { snapshotId: number; scannedAt: string; scannerVersion: string; scoringVersion: string } | null;
}

/** One row of the snapshots table (summary columns + raw blob). */
export interface SnapshotRowData {
  domain: string;
  scanned_at: string;
  scanner_version: string;
  scoring_version: string;
  status: SnapshotStatus;
  http_status: number | null;
  used_https: number;
  tls_protocol: string | null;
  weak_cipher: number;
  header_score: number;
  header_grade: string;
  verdict_status: string;
  verdict_score: number;
  raw_snapshot: string;
}

/** One row of the changes table. */
export interface ChangeRowData {
  domain: string;
  from_snapshot_id: number;
  to_snapshot_id: number;
  detected_at: string;
  comparable: number;
  changed_fields: string;
  score_delta: number | null;
  verdict_moved: number;
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/** Hostname key for history: lowercased host of the normalized target URL. */
export function domainKey(target: string): string {
  try {
    return new URL(target).hostname.toLowerCase();
  } catch {
    return target.toLowerCase();
  }
}

/**
 * Observation-completeness status (Section F). `failed` = target unreachable
 * at all (top-level http.error set). `partial` = the HTTP request succeeded
 * but a subsystem (TLS probe, DNS) did not complete cleanly. `complete`
 * otherwise. This is about observation quality, NOT health: a healthy-looking
 * site with verdict FAIL is still `complete`.
 */
export function snapshotStatus(snapshot: SecuritySnapshot): SnapshotStatus {
  if (snapshot.http.error !== null) return "failed";
  if (snapshot.tls.probeError !== null || snapshot.dns.note === "not evaluated") return "partial";
  return "complete";
}

export function snapshotToRow(domain: string, snapshot: SecuritySnapshot): SnapshotRowData {
  return {
    domain,
    scanned_at: snapshot.timestamp,
    scanner_version: SCANNER_VERSION,
    scoring_version: SCORING_VERSION,
    status: snapshotStatus(snapshot),
    http_status: snapshot.http.status,
    used_https: snapshot.tls.usedHttps ? 1 : 0,
    tls_protocol: snapshot.tls.protocol,
    weak_cipher: snapshot.tls.weakCipher ? 1 : 0,
    header_score: snapshot.headerScore.score,
    header_grade: snapshot.headerScore.grade,
    verdict_status: snapshot.verdict.status,
    verdict_score: snapshot.verdict.score,
    raw_snapshot: JSON.stringify(snapshot),
  };
}

// ---------------------------------------------------------------------------
// Comparator (Section D + E)
// ---------------------------------------------------------------------------

/**
 * Structured-field diff with materiality tiers. Deterministic by
 * construction (a total function over the compared fields); threshold
 * optimality is NOT claimed (Section N.5 / Gate 0 decision 8).
 */
function diffSnapshots(from: SecuritySnapshot, to: SecuritySnapshot): ChangedField[] {
  const fields: ChangedField[] = [];
  const add = (field: string, fromVal: unknown, toVal: unknown, materiality: Materiality) => {
    fields.push({ field, from: fromVal, to: toVal, materiality });
  };

  // HTTPS presence — the downgrade is critical.
  if (from.tls.usedHttps !== to.tls.usedHttps) {
    add("tls.usedHttps", from.tls.usedHttps, to.tls.usedHttps, from.tls.usedHttps && !to.tls.usedHttps ? "critical" : "material");
  }

  // Verdict tier move — PASS->FAIL is critical; any other tier move is material.
  if (from.verdict.status !== to.verdict.status) {
    add("verdict.status", from.verdict.status, to.verdict.status, from.verdict.status === "PASS" && to.verdict.status === "FAIL" ? "critical" : "material");
  }

  // Weak cipher — a NEW weak cipher is critical; hardening away is material.
  if (from.tls.weakCipher !== to.tls.weakCipher) {
    add("tls.weakCipher", from.tls.weakCipher, to.tls.weakCipher, to.tls.weakCipher ? "critical" : "material");
  }

  // HTTP status change (http.ok is fully derived from status, so status alone
  // is diffed to avoid duplicate entries).
  if (from.http.status !== to.http.status) {
    add("http.status", from.http.status, to.http.status, "material");
  }

  // TLS protocol — informational; the weakCipher flag carries the security signal.
  if (from.tls.protocol !== to.tls.protocol) {
    add("tls.protocol", from.tls.protocol, to.tls.protocol, "informational");
  }

  // DNS record presence only (Section D: presence/absence, not record values).
  for (const key of ["hasA", "hasAAAA", "hasMX", "hasTXT"] as const) {
    if (from.dns[key] !== to.dns[key]) {
      add(`dns.${key}`, from.dns[key], to.dns[key], "informational");
    }
  }

  // Security headers — presence change is material; value change is material
  // for HSTS/CSP specifically (they carry the most security weight).
  const headerKeys = [
    "strictTransportSecurity",
    "contentSecurityPolicy",
    "xFrameOptions",
    "xContentTypeOptions",
    "referrerPolicy",
    "permissionsPolicy",
  ] as const;
  for (const key of headerKeys) {
    const fromVal = from.securityHeaders[key];
    const toVal = to.securityHeaders[key];
    const fromPresent = fromVal !== null;
    const toPresent = toVal !== null;
    if (fromPresent !== toPresent) {
      add(`securityHeaders.${key}`, fromVal, toVal, "material");
    } else if (
      fromPresent &&
      toPresent &&
      fromVal !== toVal &&
      (key === "strictTransportSecurity" || key === "contentSecurityPolicy")
    ) {
      add(`securityHeaders.${key}`, fromVal, toVal, "material");
    }
  }

  // Scores — informational at field level; the |delta| >= 15 rule is applied
  // at record level (recordMateriality) to the blended verdict score.
  if (from.headerScore.score !== to.headerScore.score) {
    add("headerScore.score", from.headerScore.score, to.headerScore.score, "informational");
  }
  if (from.verdict.score !== to.verdict.score) {
    add("verdict.score", from.verdict.score, to.verdict.score, "informational");
  }

  // Tech fingerprint — informational.
  if (from.techObservations.server !== to.techObservations.server) {
    add("techObservations.server", from.techObservations.server, to.techObservations.server, "informational");
  }
  if (from.techObservations.poweredByCloudflare !== to.techObservations.poweredByCloudflare) {
    add("techObservations.poweredByCloudflare", from.techObservations.poweredByCloudflare, to.techObservations.poweredByCloudflare, "informational");
  }
  if (from.techObservations.cmsGuess !== to.techObservations.cmsGuess) {
    add("techObservations.cmsGuess", from.techObservations.cmsGuess, to.techObservations.cmsGuess, "informational");
  }

  // Redirect chain — hop count only (exact URLs are noise, Section D).
  if (from.http.redirectChain.length !== to.http.redirectChain.length) {
    add("http.redirectChain.length", from.http.redirectChain.length, to.http.redirectChain.length, "informational");
  }

  return fields;
}

/**
 * Version-gated comparison of two snapshots of the same domain.
 * Non-comparable results still carry both snapshots' versions (via the
 * caller's response shape); they never fabricate a score delta.
 */
export function computeChange(
  prior: SnapshotVersionMeta,
  priorSnapshot: SecuritySnapshot,
  current: SnapshotVersionMeta,
  currentSnapshot: SecuritySnapshot
): CompareResult {
  if (prior.scoring_version !== current.scoring_version) {
    return {
      comparable: false,
      reason: "scoring model changed between observations",
      changedFields: [],
      scoreDelta: null,
      verdictMoved: false,
    };
  }
  if (prior.scanner_version !== current.scanner_version) {
    return {
      comparable: false,
      reason: "scanner model changed between observations",
      changedFields: [],
      scoreDelta: null,
      verdictMoved: false,
    };
  }
  const changedFields = diffSnapshots(priorSnapshot, currentSnapshot);
  const scoreDelta = currentSnapshot.verdict.score - priorSnapshot.verdict.score;
  const verdictMoved = priorSnapshot.verdict.status !== currentSnapshot.verdict.status;
  return {
    comparable: true,
    reason: "same scoring model",
    changedFields,
    scoreDelta,
    verdictMoved,
  };
}

/** Record-level materiality: highest field tier, else score-delta rule (Section D). */
export function recordMateriality(result: CompareResult): Materiality | null {
  if (!result.comparable) return null;
  if (result.changedFields.some((f) => f.materiality === "critical")) return "critical";
  if (result.changedFields.some((f) => f.materiality === "material")) return "material";
  if (result.scoreDelta !== null && Math.abs(result.scoreDelta) >= 15) return "material";
  return "informational";
}

// ---------------------------------------------------------------------------
// D1 store (prepared statements only; all reads hit the per-domain indexes)
// ---------------------------------------------------------------------------

export async function insertSnapshotRow(db: D1Database, data: SnapshotRowData): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO snapshots (domain, scanned_at, scanner_version, scoring_version, status, http_status, used_https, tls_protocol, weak_cipher, header_score, header_grade, verdict_status, verdict_score, raw_snapshot)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`
    )
    .bind(
      data.domain,
      data.scanned_at,
      data.scanner_version,
      data.scoring_version,
      data.status,
      data.http_status,
      data.used_https,
      data.tls_protocol,
      data.weak_cipher,
      data.header_score,
      data.header_grade,
      data.verdict_status,
      data.verdict_score,
      data.raw_snapshot
    )
    .run();
  return Number(res.meta.last_row_id);
}

export async function getPriorCompleteSnapshot(
  db: D1Database,
  domain: string,
  before: string
): Promise<(SnapshotVersionMeta & { raw_snapshot: string }) | null> {
  const row = await db
    .prepare(
      `SELECT id, domain, scanned_at, scanner_version, scoring_version, status, raw_snapshot
       FROM snapshots
       WHERE domain = ?1 AND status = 'complete' AND scanned_at < ?2
       ORDER BY scanned_at DESC
       LIMIT 1`
    )
    .bind(domain, before)
    .first();
  return (row as (SnapshotVersionMeta & { raw_snapshot: string }) | null) ?? null;
}

export async function insertChangeRow(db: D1Database, data: ChangeRowData): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO changes (domain, from_snapshot_id, to_snapshot_id, detected_at, comparable, changed_fields, score_delta, verdict_moved)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    )
    .bind(
      data.domain,
      data.from_snapshot_id,
      data.to_snapshot_id,
      data.detected_at,
      data.comparable,
      data.changed_fields,
      data.score_delta,
      data.verdict_moved
    )
    .run();
  return Number(res.meta.last_row_id);
}

/** History list view — summary columns only, NEVER raw_snapshot (Section N.7). */
export async function listSnapshots(
  db: D1Database,
  domain: string,
  limit: number,
  before?: string
): Promise<Array<Record<string, unknown>>> {
  const base =
    `SELECT id, domain, scanned_at, scanner_version, scoring_version, status, http_status, used_https, tls_protocol, weak_cipher, header_score, header_grade, verdict_status, verdict_score
     FROM snapshots
     WHERE domain = ?1`;
  const sql = before
    ? `${base} AND scanned_at < ?2 ORDER BY scanned_at DESC LIMIT ?3`
    : `${base} ORDER BY scanned_at DESC LIMIT ?2`;
  const stmt = before ? db.prepare(sql).bind(domain, before, limit) : db.prepare(sql).bind(domain, limit);
  const res = await stmt.all();
  return res.results as Array<Record<string, unknown>>;
}

/** Changes list view — joins snapshots twice so provenance is observable without storing versions twice. */
export async function listChanges(
  db: D1Database,
  domain: string,
  limit: number,
  before?: string
): Promise<Array<Record<string, unknown>>> {
  const base =
    `SELECT ch.id AS change_id, ch.domain, ch.detected_at, ch.comparable, ch.changed_fields, ch.score_delta, ch.verdict_moved,
            f.id AS from_id, f.scanned_at AS from_scanned_at, f.scanner_version AS from_scanner_version, f.scoring_version AS from_scoring_version,
            t.id AS to_id, t.scanned_at AS to_scanned_at, t.scanner_version AS to_scanner_version, t.scoring_version AS to_scoring_version
     FROM changes ch
     JOIN snapshots f ON f.id = ch.from_snapshot_id
     JOIN snapshots t ON t.id = ch.to_snapshot_id
     WHERE ch.domain = ?1`;
  const sql = before
    ? `${base} AND ch.detected_at < ?2 ORDER BY ch.detected_at DESC LIMIT ?3`
    : `${base} ORDER BY ch.detected_at DESC LIMIT ?2`;
  const stmt = before ? db.prepare(sql).bind(domain, before, limit) : db.prepare(sql).bind(domain, limit);
  const res = await stmt.all();
  return res.results as Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Compare-on-write for /snapshot/run?history=true. Always writes exactly one
 * snapshots row; writes a changes row only when a prior complete snapshot
 * exists AND the comparison is version-comparable. Never throws for
 * application-level outcomes (no prior, version gate) — only for storage
 * failures, which callers may catch (see runSnapshotWithHistory).
 */
export async function recordAndCompare(db: D1Database, snapshot: SecuritySnapshot): Promise<ChangeResponse> {
  const domain = domainKey(snapshot.target);
  const detectedAt = new Date().toISOString();
  const toMeta: SnapshotVersionMeta = {
    id: await insertSnapshotRow(db, snapshotToRow(domain, snapshot)),
    scanned_at: snapshot.timestamp,
    scanner_version: SCANNER_VERSION,
    scoring_version: SCORING_VERSION,
  };

  const prior = await getPriorCompleteSnapshot(db, domain, snapshot.timestamp);
  if (!prior) {
    return {
      comparable: false,
      reason: "no prior snapshot",
      changedFields: [],
      scoreDelta: null,
      verdictMoved: false,
      detectedAt,
      from: null,
      to: {
        snapshotId: toMeta.id,
        scannedAt: toMeta.scanned_at,
        scannerVersion: toMeta.scanner_version,
        scoringVersion: toMeta.scoring_version,
      },
    };
  }

  const priorSnapshot = JSON.parse(prior.raw_snapshot) as SecuritySnapshot;
  const result = computeChange(prior, priorSnapshot, toMeta, snapshot);

  let changeId: number | undefined;
  if (result.comparable) {
    changeId = await insertChangeRow(db, {
      domain,
      from_snapshot_id: prior.id,
      to_snapshot_id: toMeta.id,
      detected_at: detectedAt,
      comparable: 1,
      changed_fields: JSON.stringify(result.changedFields),
      score_delta: result.scoreDelta,
      verdict_moved: result.verdictMoved ? 1 : 0,
    });
  }

  return {
    ...result,
    detectedAt,
    changeId,
    from: {
      snapshotId: prior.id,
      scannedAt: prior.scanned_at,
      scannerVersion: prior.scanner_version,
      scoringVersion: prior.scoring_version,
    },
    to: {
      snapshotId: toMeta.id,
      scannedAt: toMeta.scanned_at,
      scannerVersion: toMeta.scanner_version,
      scoringVersion: toMeta.scoring_version,
    },
  };
}

/**
 * Route-facing wrapper: the settled payment must never fail because auxiliary
 * history persistence broke — on storage error, degrade to an explicit
 * non-comparable change with a structured log line (Gate 0 decision 4-ish /
 * locked D1-failure decision).
 */
export async function runSnapshotWithHistory(db: D1Database, snapshot: SecuritySnapshot): Promise<ChangeResponse> {
  try {
    return await recordAndCompare(db, snapshot);
  } catch (err) {
    console.log(
      JSON.stringify({
        event: "history_write_failed",
        target: snapshot.target,
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return {
      comparable: false,
      reason: "history storage unavailable",
      changedFields: [],
      scoreDelta: null,
      verdictMoved: false,
      detectedAt: new Date().toISOString(),
      from: null,
      to: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Read-path mapping (GET /history, GET /changes)
// ---------------------------------------------------------------------------

export interface SnapshotSummary {
  snapshotId: number;
  domain: string;
  scannedAt: string;
  scannerVersion: string;
  scoringVersion: string;
  status: SnapshotStatus;
  httpStatus: number | null;
  usedHttps: boolean;
  tlsProtocol: string | null;
  weakCipher: boolean;
  headerScore: number;
  headerGrade: string;
  verdictStatus: string;
  verdictScore: number;
}

function toSnapshotSummary(row: Record<string, unknown>): SnapshotSummary {
  return {
    snapshotId: Number(row.id),
    domain: String(row.domain),
    scannedAt: String(row.scanned_at),
    scannerVersion: String(row.scanner_version),
    scoringVersion: String(row.scoring_version),
    status: row.status as SnapshotStatus,
    httpStatus: row.http_status === null ? null : Number(row.http_status),
    usedHttps: Number(row.used_https) === 1,
    tlsProtocol: row.tls_protocol === null ? null : String(row.tls_protocol),
    weakCipher: Number(row.weak_cipher) === 1,
    headerScore: Number(row.header_score),
    headerGrade: String(row.header_grade),
    verdictStatus: String(row.verdict_status),
    verdictScore: Number(row.verdict_score),
  };
}

export interface ChangeEntry {
  changeId: number;
  domain: string;
  detectedAt: string;
  comparable: boolean;
  reason: string;
  materiality: Materiality | null;
  changedFields: ChangedField[];
  scoreDelta: number | null;
  verdictMoved: boolean;
  from: { snapshotId: number; scannedAt: string; scannerVersion: string; scoringVersion: string };
  to: { snapshotId: number; scannedAt: string; scannerVersion: string; scoringVersion: string };
}

function toChangeEntry(row: Record<string, unknown>): ChangeEntry {
  const fromScoring = String(row.from_scoring_version);
  const toScoring = String(row.to_scoring_version);
  const fromScanner = String(row.from_scanner_version);
  const toScanner = String(row.to_scanner_version);
  const comparable = Number(row.comparable) === 1;
  // Reason is derived deterministically from the joined versions; stored rows
  // are comparable today, so this is "same scoring model" — the derivation
  // stays correct if future cycles persist non-comparable rows.
  const reason = !comparable
    ? fromScoring !== toScoring
      ? "scoring model changed between observations"
      : fromScanner !== toScanner
        ? "scanner model changed between observations"
        : "not comparable"
    : "same scoring model";
  let changedFields: ChangedField[] = [];
  try {
    changedFields = JSON.parse(String(row.changed_fields)) as ChangedField[];
  } catch {
    changedFields = [];
  }
  return {
    changeId: Number(row.change_id),
    domain: String(row.domain),
    detectedAt: String(row.detected_at),
    comparable,
    reason,
    materiality: comparable ? recordMateriality({ comparable, reason, changedFields, scoreDelta: row.score_delta === null ? null : Number(row.score_delta), verdictMoved: Number(row.verdict_moved) === 1 }) : null,
    changedFields,
    scoreDelta: row.score_delta === null ? null : Number(row.score_delta),
    verdictMoved: Number(row.verdict_moved) === 1,
    from: {
      snapshotId: Number(row.from_id),
      scannedAt: String(row.from_scanned_at),
      scannerVersion: fromScanner,
      scoringVersion: fromScoring,
    },
    to: {
      snapshotId: Number(row.to_id),
      scannedAt: String(row.to_scanned_at),
      scannerVersion: toScanner,
      scoringVersion: toScoring,
    },
  };
}

export interface HistoryListResult<T> {
  domain: string;
  items: T[];
  nextBefore?: string;
}

export async function listSnapshotHistory(
  db: D1Database,
  domain: string,
  limit: number,
  before?: string
): Promise<HistoryListResult<SnapshotSummary>> {
  const rows = await listSnapshots(db, domain, limit, before);
  const items = rows.map(toSnapshotSummary);
  const nextBefore = items.length === limit ? items[items.length - 1].scannedAt : undefined;
  return { domain, items, nextBefore };
}

export async function listChangeHistory(
  db: D1Database,
  domain: string,
  limit: number,
  before?: string
): Promise<HistoryListResult<ChangeEntry>> {
  const rows = await listChanges(db, domain, limit, before);
  const items = rows.map(toChangeEntry);
  const nextBefore = items.length === limit ? items[items.length - 1].detectedAt : undefined;
  return { domain, items, nextBefore };
}

/** limit query param: default 10, clamped to [1, 100]. */
export function parseListLimit(raw: string | undefined, def = 10, max = 100): number {
  if (!raw) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return def;
  return Math.min(n, max);
}

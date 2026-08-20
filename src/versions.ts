/**
 * Version identifiers for the snapshot pipeline and its scoring model.
 *
 * Bump discipline (manual, deliberate — Cycle 2 spec Section E):
 * - SCANNER_VERSION: bump when WHAT is measured changes (a header added to
 *   the check list, a field added/renamed/removed in SecuritySnapshot, or a
 *   behavior change to dns-check.ts / tls-probe.ts / content-check.ts).
 * - SCORING_VERSION: bump when HOW a score/grade/verdict is computed changes
 *   (header-scoring.ts / verdict.ts / content-check.ts scoring logic), even if
 *   the measured inputs are identical.
 *
 * v2 (Gate 2, 20 Aug 2026): SCANNER_VERSION snapshot-v1 -> snapshot-v2 and
 * SCORING_VERSION scoring-v1 -> scoring-v2 — the content-accuracy dimension was
 * added (new SecuritySnapshot.content field, new content scoring + D4 hard cap
 * in the verdict blend). Bumped deliberately per the discipline below; the
 * freeze test in test/history.test.ts was updated in the same change.
 *
 * The comparator refuses to compute a field diff / score delta across a
 * version boundary (scoring_version mismatch is mandatory; scanner_version
 * mismatch is conservatively treated the same way). Changing scoring logic
 * without a corresponding SCORING_VERSION bump silently corrupts
 * comparability and is forbidden by the Cycle 2 spec — the freeze test in
 * test/history.test.ts is the loud failure for accidental bumps.
 */

export const SCANNER_VERSION = "snapshot-v2";
export const SCORING_VERSION = "scoring-v2";

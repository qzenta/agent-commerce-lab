/**
 * Version identifiers for the snapshot pipeline and its scoring model.
 *
 * Bump discipline (manual, deliberate — Cycle 2 spec Section E):
 * - SCANNER_VERSION: bump when WHAT is measured changes (a header added to
 *   the check list, a field added/renamed/removed in SecuritySnapshot, or a
 *   behavior change to dns-check.ts / tls-probe.ts).
 * - SCORING_VERSION: bump when HOW a score/grade/verdict is computed changes
 *   (header-scoring.ts / verdict.ts logic), even if the measured inputs are
 *   identical.
 *
 * The comparator refuses to compute a field diff / score delta across a
 * version boundary (scoring_version mismatch is mandatory; scanner_version
 * mismatch is conservatively treated the same way). Changing scoring logic
 * without a corresponding SCORING_VERSION bump silently corrupts
 * comparability and is forbidden by the Cycle 2 spec — the freeze test in
 * test/history.test.ts is the loud failure for accidental bumps.
 */

export const SCANNER_VERSION = "snapshot-v1";
export const SCORING_VERSION = "scoring-v1";

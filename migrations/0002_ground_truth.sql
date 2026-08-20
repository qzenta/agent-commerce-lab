-- Gate 2 (SiteHealth Passport v2 P0): compliance-figure ground truth + match patterns.
-- Per the approved Gate 1 plan (Section 3):
--   * ground_truth is SELECT-only from the Worker — no runtime write path exists anywhere
--     in the Worker codebase; rows are loaded only via scripts/load-ground-truth.ts under
--     human approval (approved_by/approved_at/source_ref are mandatory on every row).
--   * Supersession, not deletion: when a gazette moves a figure, the old row gets
--     applies_until set and a new row is approved. This powers figure-stale detection.
--   * fact_patterns.kind: 'value' = matches a known value (current or superseded),
--     'context' = keyword-windowed capture used for figure-mismatch detection,
--     'keyword' = topic words used for absent-required-figure detection.

CREATE TABLE ground_truth (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  fact_key      TEXT NOT NULL UNIQUE,     -- e.g. 'za.vat.mandatory_threshold_zar'
  label         TEXT NOT NULL,            -- human-readable fact name
  value         TEXT NOT NULL,            -- canonical string, e.g. '2300000' or '06-30'
  unit          TEXT,                     -- 'ZAR/year' | 'ZAR/month' | 'month-day' | ...
  jurisdiction  TEXT NOT NULL,            -- 'ZA'
  impact_class  TEXT NOT NULL,            -- 'money' | 'compliance-deadline' | 'compliance-threshold' | 'informational'
  applies_from  TEXT NOT NULL,            -- ISO date (YYYY-MM-DD) the fact became current
  applies_until TEXT,                     -- NULL = current; set when superseded
  source_tier   INTEGER NOT NULL,         -- 1 = gazette/statutory; 2 = official regulator page; 3 = inferred
  source_ref    TEXT NOT NULL,            -- gazette number / official URL — required, no tier-3 seed without approval
  approved_by   TEXT NOT NULL,            -- human approver name
  approved_at   TEXT NOT NULL,
  notes         TEXT
);
CREATE INDEX idx_gt_juris_apply ON ground_truth (jurisdiction, applies_from DESC);

CREATE TABLE fact_patterns (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  fact_key  TEXT NOT NULL REFERENCES ground_truth(fact_key),
  kind      TEXT NOT NULL DEFAULT 'value',  -- 'value' | 'context' | 'keyword'
  pattern   TEXT NOT NULL,                  -- JS regex source
  priority  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_fp_fact ON fact_patterns (fact_key);
-- Unique per (fact_key, kind, pattern): required for the idempotent
-- ON CONFLICT upsert in scripts/load-ground-truth.ts.
CREATE UNIQUE INDEX idx_fp_unique ON fact_patterns (fact_key, kind, pattern);

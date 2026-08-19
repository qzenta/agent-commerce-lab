-- Cycle 2: Historical / change detection — initial schema (DSH Gate 2).
-- Per the approved package Section C: two tables, not more. Indexes cover
-- the only query patterns the app issues (per-domain, newest-first).
--
-- NOTE on FK enforcement: D1/SQLite does not enforce foreign keys by default.
-- The REFERENCES clauses are kept as documentation; referential integrity is
-- owned by the single-writer application flow (a change row is only ever
-- written with ids returned by the inserts performed in the same request).

CREATE TABLE snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  scanned_at TEXT NOT NULL,          -- ISO timestamp, same format as snapshot.timestamp
  scanner_version TEXT NOT NULL,     -- e.g. "snapshot-v1" — bumped on behavior change to what is measured
  scoring_version TEXT NOT NULL,     -- e.g. "scoring-v1" — bumped on change to how scoring/verdict compute
  status TEXT NOT NULL,              -- 'complete' | 'partial' | 'failed'
  http_status INTEGER,
  used_https INTEGER,                -- 0/1
  tls_protocol TEXT,
  weak_cipher INTEGER,               -- 0/1
  header_score INTEGER,
  header_grade TEXT,
  verdict_status TEXT,               -- PASS/WARN/FAIL
  verdict_score INTEGER,
  raw_snapshot TEXT NOT NULL         -- full JSON of SecuritySnapshot, for detail/audit
);
CREATE INDEX idx_snapshots_domain_time ON snapshots (domain, scanned_at DESC);

CREATE TABLE changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  from_snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  to_snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  detected_at TEXT NOT NULL,
  comparable INTEGER NOT NULL,       -- 0/1 — false if version gating refused the comparison
  changed_fields TEXT NOT NULL,      -- JSON array of {field, from, to, materiality}
  score_delta INTEGER,
  verdict_moved INTEGER              -- 0/1
);
CREATE INDEX idx_changes_domain_time ON changes (domain, detected_at DESC);

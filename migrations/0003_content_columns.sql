-- Gate 2 (SiteHealth Passport v2 P0): summary columns for the content-accuracy dimension.
-- Added to the existing snapshots table (0001_init.sql is immutable; new migrations only).
-- NULL when the snapshot was taken without content=true — mirrors the optional content
-- block in SecuritySnapshot. The full content result (scope, facts, findings, score, grade,
-- status) lives in raw_snapshot JSON, which remains the audit-of-record.

ALTER TABLE snapshots ADD COLUMN content_score INTEGER;
ALTER TABLE snapshots ADD COLUMN content_grade TEXT;
ALTER TABLE snapshots ADD COLUMN content_status TEXT;        -- PASS/WARN/FAIL
ALTER TABLE snapshots ADD COLUMN content_pages_scanned INTEGER;

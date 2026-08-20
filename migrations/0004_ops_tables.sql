-- Gate 4 P0 (20 Aug 2026): pilot operations scaffolding — alerts + findings review.
-- Approved under the Gate 4 authorization (§16 P0: alert email delivery, FP-rate
-- tracking scaffolding). Additive-only; no changes to existing tables.

-- Alert rows: produced by the scheduled scan when a comparable change record has
-- materiality critical/material or the verdict moved. Delivery: a config-gated
-- webhook (ALERT_WEBHOOK_URL env); when unset, the row is recorded with a null
-- delivered_at and a structured log line (delivery not configured).
CREATE TABLE alerts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  domain        TEXT NOT NULL,
  detected_at   TEXT NOT NULL,
  change_id     INTEGER,                 -- changes.id when the alert is change-driven
  materiality   TEXT,                    -- 'critical' | 'material'
  verdict_moved INTEGER NOT NULL DEFAULT 0,
  summary       TEXT NOT NULL,
  delivered_at  TEXT,                    -- NULL = recorded, not yet delivered
  delivery_error TEXT
);
CREATE INDEX idx_alerts_domain_time ON alerts (domain, detected_at DESC);

-- FP-rate tracking scaffold: a human marks each content finding confirmed or
-- false-positive (the 'pending' default is set on first sighting). Rulings are
-- human-only (Daniel or a designated reviewer); DSH never rules its own findings.
CREATE TABLE findings_review (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  domain       TEXT NOT NULL,
  finding_key  TEXT NOT NULL,            -- e.g. 'figure-mismatch:za.uif.monthly_ceiling_zar'
  severity     TEXT,                     -- critical/material/informational at ruling time
  status       TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'confirmed' | 'false-positive'
  ruled_by     TEXT,
  ruled_at     TEXT,
  notes        TEXT,
  UNIQUE (domain, finding_key)
);
CREATE INDEX idx_findings_review_domain ON findings_review (domain);

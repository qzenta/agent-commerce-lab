/**
 * Pilot alerting (Gate 4 P0): detect material/critical changes from the
 * version-gated change record, persist an alert row, and deliver via a
 * config-gated webhook (ALERT_WEBHOOK_URL). When no webhook is configured the
 * alert is still RECORDED (observable via GET /alerts) with a null
 * delivered_at and a structured log line — delivery activates when Daniel
 * configures the webhook (e.g. an email provider endpoint). Alerts never block
 * the scan: a failed delivery is recorded, not retried in-band.
 */

import { recordMateriality, domainKey, type ChangeResponse } from "./history";

export interface AlertRowData {
  domain: string;
  detected_at: string;
  change_id: number | null;
  materiality: "critical" | "material" | null;
  verdict_moved: boolean;
  summary: string;
  delivered_at: string | null;
  delivery_error: string | null;
}

export function changeMateriality(change: ChangeResponse): "critical" | "material" | "informational" | null {
  if (!change.comparable) return null;
  return recordMateriality({
    comparable: change.comparable,
    reason: change.reason,
    changedFields: change.changedFields,
    scoreDelta: change.scoreDelta,
    verdictMoved: change.verdictMoved,
  });
}

/** Alerts fire on comparable changes with materiality critical/material (or a verdict move, which is material-or-worse by construction). */
export function shouldAlert(change: ChangeResponse): boolean {
  const m = changeMateriality(change);
  return m === "critical" || m === "material";
}

export function alertSummary(change: ChangeResponse): string {
  const m = changeMateriality(change) ?? "informational";
  const moved = change.verdictMoved ? "verdict moved" : "verdict unchanged";
  return `Change detected: materiality ${m}, ${change.changedFields.length} field(s) changed, score delta ${change.scoreDelta}, ${moved}.`;
}

export async function insertAlertRow(db: D1Database, row: AlertRowData): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO alerts (domain, detected_at, change_id, materiality, verdict_moved, summary, delivered_at, delivery_error)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    )
    .bind(
      row.domain,
      row.detected_at,
      row.change_id,
      row.materiality,
      row.verdict_moved ? 1 : 0,
      row.summary,
      row.delivered_at,
      row.delivery_error
    )
    .run();
  return Number(res.meta.last_row_id);
}

export interface AlertDeliveryResult {
  deliveredAt: string | null;
  error: string | null;
}

/** POSTs the alert payload to the configured webhook. No fetch happens when the URL is unset. */
export async function deliverAlert(
  webhookUrl: string | undefined,
  alert: AlertRowData,
  fetchFn: typeof fetch = fetch
): Promise<AlertDeliveryResult> {
  if (!webhookUrl) {
    return { deliveredAt: null, error: null };
  }
  try {
    const res = await fetchFn(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "sitehealth.alert",
        domain: alert.domain,
        detectedAt: alert.detected_at,
        changeId: alert.change_id,
        materiality: alert.materiality,
        verdictMoved: alert.verdict_moved,
        summary: alert.summary,
      }),
    });
    if (!res.ok) {
      return { deliveredAt: null, error: `webhook responded ${res.status}` };
    }
    return { deliveredAt: new Date().toISOString(), error: null };
  } catch (err) {
    return { deliveredAt: null, error: err instanceof Error ? err.message : "webhook delivery failed" };
  }
}

/**
 * Records an alert for a change (when it warrants one) and attempts delivery.
 * Returns the row (null when no alert warranted).
 */
export async function recordAlertAndDeliver(
  db: D1Database,
  webhookUrl: string | undefined,
  change: ChangeResponse,
  targetUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<AlertRowData | null> {
  if (!shouldAlert(change)) return null;
  const row: AlertRowData = {
    domain: domainKey(targetUrl),
    detected_at: change.detectedAt,
    change_id: change.changeId ?? null,
    materiality: changeMateriality(change) === "critical" ? "critical" : "material",
    verdict_moved: change.verdictMoved,
    summary: alertSummary(change),
    delivered_at: null,
    delivery_error: null,
  };
  const delivery = await deliverAlert(webhookUrl, row, fetchFn);
  row.delivered_at = delivery.deliveredAt;
  row.delivery_error = delivery.error;
  try {
    await insertAlertRow(db, row);
  } catch (err) {
    console.log(JSON.stringify({ event: "alert_write_failed", domain: row.domain, error: err instanceof Error ? err.message : String(err) }));
  }
  if (!webhookUrl) {
    console.log(JSON.stringify({ event: "alert_recorded_delivery_not_configured", domain: row.domain, materiality: row.materiality, summary: row.summary }));
  }
  return row;
}

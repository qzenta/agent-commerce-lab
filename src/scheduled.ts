/**
 * Pilot scheduled scanning (Gate 4 P0): Cloudflare Cron Trigger handler that
 * runs the SAME content-accuracy + infra pipeline as the paid endpoint on a
 * configured set of monitored domains (MONITOR_DOMAINS env), persists each
 * snapshot via the version-gated history store, and records/delivers alerts on
 * material/critical changes. This is the "internal scan path" referenced by the
 * Gate 4 D3 plan: identical code, no HTTP payment gate (the customer's
 * invoice/EFT authorises the service; the cron executes it).
 *
 * Per-domain failure isolation: one unreachable domain never fails the batch.
 */

import { runSecuritySnapshot } from "./snapshot";
import { runSnapshotWithHistory, type ChangeResponse } from "./history";
import { recordAlertAndDeliver, type AlertRowData } from "./alerting";

export interface ScheduledScanResult {
  domain: string;
  ok: boolean;
  error?: string;
  change?: ChangeResponse;
  alert?: AlertRowData | null;
}

export interface ScheduledConfig {
  domains: string[];
  webhookUrl?: string;
  fetchFn?: typeof fetch;
}

export function parseMonitorDomains(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function runScheduledScans(
  db: D1Database,
  config: ScheduledConfig
): Promise<ScheduledScanResult[]> {
  const results: ScheduledScanResult[] = [];
  for (const url of config.domains) {
    try {
      const snapshot = await runSecuritySnapshot(url, {
        content: true,
        groundTruthDb: db,
        fetchFn: config.fetchFn,
      });
      const change = await runSnapshotWithHistory(db, snapshot);
      const alert = change.comparable
        ? await recordAlertAndDeliver(db, config.webhookUrl, change, snapshot.target, config.fetchFn)
        : null;
      results.push({ domain: snapshot.target, ok: true, change, alert });
    } catch (err) {
      results.push({ domain: url, ok: false, error: err instanceof Error ? err.message : String(err) });
      console.log(JSON.stringify({ event: "scheduled_scan_failed", domain: url, error: err instanceof Error ? err.message : String(err) }));
    }
  }
  return results;
}

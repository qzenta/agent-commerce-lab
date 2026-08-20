import { describe, expect, it, vi } from "vitest";
import {
  changeMateriality,
  shouldAlert,
  alertSummary,
  deliverAlert,
  insertAlertRow,
  recordAlertAndDeliver,
  type AlertRowData,
} from "../src/alerting";
import type { ChangeResponse } from "../src/history";

function change(overrides: Partial<ChangeResponse> = {}): ChangeResponse {
  return {
    comparable: true,
    reason: "same scoring model",
    changedFields: [{ field: "content.facts.za.uif.monthly_ceiling_zar.claims", from: ["17712"], to: ["1476"], materiality: "critical" }],
    scoreDelta: -60,
    verdictMoved: true,
    detectedAt: "2026-08-20T12:00:00.000Z",
    changeId: 3,
    from: { snapshotId: 1, scannedAt: "2026-08-20T10:00:00.000Z", scannerVersion: "snapshot-v2", scoringVersion: "scoring-v2" },
    to: { snapshotId: 2, scannedAt: "2026-08-20T12:00:00.000Z", scannerVersion: "snapshot-v2", scoringVersion: "scoring-v2" },
    ...overrides,
  };
}

class FakeAlertsD1 {
  rows: AlertRowData[] = [];
  prepare(sql: string) {
    const s = sql.replace(/\s+/g, " ").trim();
    return {
      bind: (...values: unknown[]) => ({
        run: async () => {
          if (s.startsWith("INSERT INTO alerts")) {
            const cols = (s.match(/INSERT INTO alerts \(([^)]+)\)/)![1]).split(",").map((c) => c.trim());
            const row: Record<string, unknown> = { id: this.rows.length + 1 };
            cols.forEach((c, i) => (row[c] = values[i]));
            this.rows.push(row as unknown as AlertRowData);
            return { meta: { last_row_id: row.id, changes: 1 } };
          }
          throw new Error("unhandled SQL: " + s);
        },
      }),
    };
  }
}

describe("changeMateriality / shouldAlert / alertSummary", () => {
  it("returns null and never alerts for non-comparable results", () => {
    const c = change({ comparable: false, reason: "no prior snapshot", changedFields: [], scoreDelta: null, verdictMoved: false });
    expect(changeMateriality(c)).toBeNull();
    expect(shouldAlert(c)).toBe(false);
  });

  it("alerts on material changes", () => {
    const c = change({ changedFields: [{ field: "http.status", from: 200, to: 500, materiality: "material" }], scoreDelta: -20, verdictMoved: false });
    expect(changeMateriality(c)).toBe("material");
    expect(shouldAlert(c)).toBe(true);
  });

  it("alerts on critical changes and verdict moves", () => {
    expect(shouldAlert(change())).toBe(true); // critical field + verdictMoved
    const critical = change({ changedFields: [{ field: "content.facts.x", from: null, to: ["1476"], materiality: "critical" }] });
    expect(changeMateriality(critical)).toBe("critical");
    expect(shouldAlert(critical)).toBe(true);
  });

  it("does not alert on informational-only changes", () => {
    const c = change({ changedFields: [{ field: "techObservations.server", from: "nginx", to: "cloudflare", materiality: "informational" }], scoreDelta: -2, verdictMoved: false });
    expect(shouldAlert(c)).toBe(false);
  });

  it("summaries are human-readable", () => {
    expect(alertSummary(change())).toMatch(/critical/);
    expect(alertSummary(change())).toContain("verdict moved");
  });
});

describe("deliverAlert", () => {
  it("does not fetch when no webhook is configured", async () => {
    const fetchFn = vi.fn(async () => new Response("ok"));
    const row: AlertRowData = { domain: "x.com", detected_at: "t", change_id: 1, materiality: "critical", verdict_moved: true, summary: "s", delivered_at: null, delivery_error: null };
    const res = await deliverAlert(undefined, row, fetchFn);
    expect(res.deliveredAt).toBeNull();
    expect(res.error).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("POSTs the alert payload to the configured webhook", async () => {
    const fetchFn = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response("ok", { status: 200 }));
    const row: AlertRowData = { domain: "x.com", detected_at: "t", change_id: 1, materiality: "critical", verdict_moved: true, summary: "s", delivered_at: null, delivery_error: null };
    const res = await deliverAlert("https://hook.example/alert", row, fetchFn);
    expect(res.deliveredAt).not.toBeNull();
    expect(res.error).toBeNull();
    const call = fetchFn.mock.calls[0];
    const url = String(call[0]);
    const init = call[1] as RequestInit;
    expect(url).toBe("https://hook.example/alert");
    const payload = JSON.parse(String(init.body));
    expect(payload.type).toBe("sitehealth.alert");
    expect(payload.domain).toBe("x.com");
    expect(payload.materiality).toBe("critical");
  });

  it("records a delivery error on non-2xx responses", async () => {
    const fetchFn = vi.fn(async () => new Response("nope", { status: 500 }));
    const row: AlertRowData = { domain: "x.com", detected_at: "t", change_id: null, materiality: "material", verdict_moved: false, summary: "s", delivered_at: null, delivery_error: null };
    const res = await deliverAlert("https://hook.example/alert", row, fetchFn);
    expect(res.deliveredAt).toBeNull();
    expect(res.error).toMatch(/500/);
  });
});

describe("insertAlertRow + recordAlertAndDeliver", () => {
  it("records a critical alert and inserts the row", async () => {
    const fake = new FakeAlertsD1();
    const db = fake as unknown as D1Database;
    const alert = await recordAlertAndDeliver(db, undefined, change(), "https://fixture.example/");
    expect(alert).not.toBeNull();
    expect(alert!.domain).toBe("fixture.example");
    expect(alert!.materiality).toBe("critical");
    expect(alert!.delivered_at).toBeNull();
    expect(fake.rows).toHaveLength(1);
  });

  it("records nothing when the change does not warrant an alert", async () => {
    const fake = new FakeAlertsD1();
    const db = fake as unknown as D1Database;
    const alert = await recordAlertAndDeliver(
      db,
      undefined,
      change({ comparable: false, reason: "no prior snapshot", changedFields: [], scoreDelta: null, verdictMoved: false }),
      "https://fixture.example/"
    );
    expect(alert).toBeNull();
    expect(fake.rows).toHaveLength(0);
  });

  it("marks the row delivered when the webhook succeeds", async () => {
    const fake = new FakeAlertsD1();
    const db = fake as unknown as D1Database;
    const fetchFn = vi.fn(async () => new Response("ok"));
    const alert = await recordAlertAndDeliver(db, "https://hook.example/alert", change(), "https://fixture.example/", fetchFn);
    expect(alert!.delivered_at).not.toBeNull();
    expect(alert!.delivery_error).toBeNull();
    expect(fake.rows[0].delivered_at).not.toBeNull();
  });

  it("insertAlertRow returns the new row id", async () => {
    const fake = new FakeAlertsD1();
    const db = fake as unknown as D1Database;
    const id = await insertAlertRow(db, { domain: "x.com", detected_at: "t", change_id: null, materiality: "material", verdict_moved: false, summary: "s", delivered_at: null, delivery_error: null });
    expect(id).toBe(1);
  });
});

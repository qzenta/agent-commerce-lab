/**
 * A1 — deterministic autonomous-commerce simulation suite (authorized: simulation only).
 * Exercises service selection, price decisions against the spending policy, retries,
 * failure paths, and ambiguous-settlement / double-payment protection (§7 + §10 of the
 * plan). No funds, no endpoints: every outcome is scripted in the injected world; time
 * is a fixed `now`.
 */
import { describe, expect, it } from "vitest";
import { Ledger } from "../src/autonomous/ledger";
import { TransactionMachine } from "../src/autonomous/state-machine";
import { A1_POLICY, A1_TASKS } from "../src/autonomous/policy";
import type { Policy, SettlementStatus, ServiceResult, World } from "../src/autonomous/types";

const NOW = "2026-08-20T12:00:00.000Z";

function world(opts: {
  pay?: (serviceId: string, attempt: number) => SettlementStatus;
  verify?: (serviceId: string, attempt: number) => "settled" | "failed";
  service?: (serviceId: string, attempt: number) => ServiceResult;
} = {}): World {
  return {
    paymentOutcome: opts.pay ?? (() => "settled"),
    verifySettlement: opts.verify ?? (() => "settled"),
    serviceOutcome: opts.service ?? (() => "success"),
  };
}

function run(task: string, w: World, policy: Policy = A1_POLICY, txId = "tx-1", agentId = "agent-a") {
  const ledger = new Ledger();
  const machine = new TransactionMachine(ledger);
  const result = machine.run({ txId, agentId, task, policy, taskMap: A1_TASKS, ledger, world: w, now: NOW });
  return { ledger, result };
}

const settled = (): SettlementStatus => "settled";
const failed = (): SettlementStatus => "failed";
const unknown = (): SettlementStatus => "unknown";
const success = (): ServiceResult => "success";
const fatal = (): ServiceResult => "fatal";

// ---------------------------------------------------------------------------
// Service selection (§6 / §7 DISCOVER→IDENTIFY→ELIGIBILITY)
// ---------------------------------------------------------------------------

describe("A1 service selection", () => {
  it("selects SiteHealth for a security task and completes", () => {
    const { result } = run("security", world());
    expect(result.selectedServiceId).toBe("sitehealth");
    expect(result.outcome).toBe("completed");
    expect(result.paymentsSettled).toBe(1);
  });

  it("selects the VAT API for a tax task", () => {
    const { result } = run("tax", world());
    expect(result.selectedServiceId).toBe("vat-api");
    expect(result.outcome).toBe("completed");
  });

  it("rejects a task with no eligible service (agent cannot expand its own authority)", () => {
    const { result, ledger } = run("admin", world());
    expect(result.outcome).toBe("aborted-ineligible");
    expect(result.paymentAttempts).toBe(0);
    expect(ledger.paymentsFor("tx-1")).toHaveLength(0);
  });

  it("rejects a service disabled by policy", () => {
    const policy: Policy = { ...A1_POLICY, killSwitch: { ...A1_POLICY.killSwitch, disabledServices: ["vat-api"] } };
    const { result } = run("tax", world(), policy);
    expect(result.outcome).toBe("aborted-ineligible");
  });
});

// ---------------------------------------------------------------------------
// Price decisions against the spending policy (§5 / CHECK SPEND POLICY)
// ---------------------------------------------------------------------------

describe("A1 price decisions against policy", () => {
  it("accepts a price within the global and per-service ceilings", () => {
    const { result, ledger } = run("tax", world());
    expect(result.outcome).toBe("completed");
    const decision = ledger.entries.find((e) => e.policyDecision === "accepted");
    expect(decision?.policyDecision).toBe("accepted");
    expect(decision?.quotedPriceCents).toBe(1); // $0.01
  });

  it("rejects a price above the VAT API per-service ceiling ($0.25)", () => {
    const policy: Policy = {
      ...A1_POLICY,
      eligibleServices: A1_POLICY.eligibleServices.map((s) => (s.id === "vat-api" ? { ...s, priceCents: 30 } : s)),
    };
    const { result, ledger } = run("tax", world(), policy);
    expect(result.outcome).toBe("aborted-policy");
    expect(result.paymentAttempts).toBe(0);
    const decision = ledger.entries.find((e) => e.policyDecision === "rejected-per-service");
    expect(decision).toBeDefined();
  });

  it("rejects a price above the global per-transaction ceiling ($1.00)", () => {
    const policy: Policy = {
      ...A1_POLICY,
      eligibleServices: A1_POLICY.eligibleServices.map((s) => (s.id === "sitehealth" ? { ...s, priceCents: 150 } : s)),
    };
    const { result } = run("security", world(), policy);
    expect(result.outcome).toBe("aborted-policy");
    expect(result.paymentAttempts).toBe(0);
  });

  it("rejects a purchase that would breach the daily ceiling ($5)", () => {
    const ledger = new Ledger();
    const machine = new TransactionMachine(ledger);
    // Seed today's settled spend to $4.95; a $0.10 purchase would exceed $5.
    ledger.record({ txId: "prior", agentId: "agent-a", serviceId: "sitehealth", request: "seed", quotedPriceCents: 495, policyLimitCents: 100, policyDecision: "accepted", paymentAttempt: 1, nonce: "prior:pay:1", network: "simulation", settlementStatus: "settled", serviceResult: "success", retryCount: 0, finalOutcome: "completed", timestamp: NOW, errorOrDispute: null });
    const policy: Policy = { ...A1_POLICY, eligibleServices: A1_POLICY.eligibleServices.map((s) => (s.id === "sitehealth" ? { ...s, priceCents: 10 } : s)) };
    const result = machine.run({ txId: "tx-1", agentId: "agent-a", task: "security", policy, taskMap: A1_TASKS, ledger, world: world(), now: NOW });
    expect(result.outcome).toBe("aborted-policy");
    expect(result.paymentAttempts).toBe(0);
  });

  it("rejects a purchase that would breach the monthly ceiling ($50)", () => {
    const ledger = new Ledger();
    const machine = new TransactionMachine(ledger);
    ledger.record({ txId: "prior", agentId: "agent-a", serviceId: "vat-api", request: "seed", quotedPriceCents: 4990, policyLimitCents: 25, policyDecision: "accepted", paymentAttempt: 1, nonce: "prior:pay:1", network: "simulation", settlementStatus: "settled", serviceResult: "success", retryCount: 0, finalOutcome: "completed", timestamp: NOW, errorOrDispute: null });
    const policy: Policy = { ...A1_POLICY, eligibleServices: A1_POLICY.eligibleServices.map((s) => (s.id === "vat-api" ? { ...s, priceCents: 20 } : s)) };
    const result = machine.run({ txId: "tx-1", agentId: "agent-a", task: "tax", policy, taskMap: A1_TASKS, ledger, world: world(), now: NOW });
    expect(result.outcome).toBe("aborted-policy");
    expect(result.paymentAttempts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Payment retries + failure paths (§7 PAYMENT FAILURE)
// ---------------------------------------------------------------------------

describe("A1 payment retries and failure paths", () => {
  it("retries a failed payment once, then settles (max 2 retries)", () => {
    let attempt = 0;
    const { result, ledger } = run("security", world({ pay: () => (++attempt === 1 ? failed() : settled()) }));
    expect(result.outcome).toBe("completed");
    expect(result.paymentAttempts).toBe(2);
    expect(result.paymentRetriesUsed).toBe(1);
    expect(result.paymentsSettled).toBe(1);
    expect(result.nonces).toEqual(["tx-1:pay:1", "tx-1:pay:2"]); // distinct nonces
    expect(ledger.paymentsFor("tx-1")).toHaveLength(2);
  });

  it("escalates when payment retries are exhausted (3 attempts, 0 settled)", () => {
    const { result, ledger } = run("security", world({ pay: () => failed() }));
    expect(result.outcome).toBe("escalated");
    expect(result.paymentAttempts).toBe(3); // 1 + maxPaymentRetries 2
    expect(result.paymentsSettled).toBe(0);
    expect(result.serviceAttempts).toBe(0); // never consumed
    expect(ledger.entries.filter((e) => e.settlementStatus === "settled")).toHaveLength(0);
  });

  it("aborts on an out-of-policy price without any payment (autonomous refusal)", () => {
    const policy: Policy = { ...A1_POLICY, eligibleServices: A1_POLICY.eligibleServices.map((s) => (s.id === "vat-api" ? { ...s, priceCents: 26 } : s)) };
    const { result, ledger } = run("tax", world(), policy);
    expect(result.outcome).toBe("aborted-policy");
    expect(ledger.paymentsFor("tx-1")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Ambiguous settlement / double-payment protection (§10 — the mandatory area)
// ---------------------------------------------------------------------------

describe("A1 ambiguous settlement + double-payment protection", () => {
  it("CORE RULE: ambiguous settlement → verify → settled → consume, NEVER a second payment", () => {
    const { result, ledger } = run("security", world({ pay: () => unknown(), verify: () => "settled" }));
    expect(result.outcome).toBe("completed");
    expect(result.paymentsSettled).toBe(1);
    // Exactly ONE payment was issued — no re-purchase on unknown.
    expect(ledger.paymentsFor("tx-1")).toHaveLength(1);
    expect(result.nonces).toEqual(["tx-1:pay:1"]);
    // The verification is recorded (settlement resolved without a new payment).
    expect(ledger.entries.some((e) => e.errorOrDispute === "settlement verified: settled")).toBe(true);
  });

  it("ambiguous → verify failed → retry with a NEW nonce → settles", () => {
    let attempt = 0;
    const { result, ledger } = run("security", world({ pay: () => (++attempt === 1 ? unknown() : settled()), verify: () => "failed" }));
    expect(result.outcome).toBe("completed");
    expect(result.paymentsSettled).toBe(1);
    expect(result.paymentAttempts).toBe(2);
    expect(result.nonces).toEqual(["tx-1:pay:1", "tx-1:pay:2"]);
    expect(ledger.entries.filter((e) => e.errorOrDispute === "settlement verified: failed")).toHaveLength(1);
  });

  it("ledger guard: never re-pay a settled or unverified payment; allows after confirmed failure", () => {
    const ledger = new Ledger();
    const rec = (status: SettlementStatus) =>
      ledger.record({ txId: "tx-1", agentId: "a", serviceId: "sitehealth", request: "r", quotedPriceCents: 1, policyLimitCents: 1, policyDecision: "accepted", paymentAttempt: 1, nonce: "n1", network: "simulation", settlementStatus: status, serviceResult: null, retryCount: 0, finalOutcome: null, timestamp: NOW, errorOrDispute: null });
    rec("pending");
    expect(ledger.canIssuePayment("tx-1")).toMatchObject({ ok: false }); // unknown → verify first
    rec("settled");
    expect(ledger.canIssuePayment("tx-1")).toMatchObject({ ok: false, reason: expect.stringContaining("already settled") });
    const ledger2 = new Ledger();
    ledger2.record({ txId: "tx-2", agentId: "a", serviceId: "vat-api", request: "r", quotedPriceCents: 1, policyLimitCents: 1, policyDecision: "accepted", paymentAttempt: 1, nonce: "n1", network: "simulation", settlementStatus: "failed", serviceResult: null, retryCount: 0, finalOutcome: null, timestamp: NOW, errorOrDispute: null });
    expect(ledger2.canIssuePayment("tx-2").ok).toBe(true); // confirmed failure → retry permitted
  });

  it("nonces are never reused across attempts or transactions", () => {
    const { ledger: l1 } = run("security", world({ pay: () => "unknown", verify: () => "failed" }));
    const { ledger: l2 } = run("tax", world({ pay: () => "failed" }), A1_POLICY, "tx-2");
    const nonces = [...l1.entries, ...l2.entries].map((e) => e.nonce).filter(Boolean);
    expect(new Set(nonces).size).toBe(nonces.length);
  });
});

// ---------------------------------------------------------------------------
// Service failure paths (§7 SERVICE FAILURE)
// ---------------------------------------------------------------------------

describe("A1 service failure paths", () => {
  it("retries a service failure once, then succeeds (max 3 retries)", () => {
    let attempt = 0;
    const { result } = run("security", world({ service: () => (++attempt === 1 ? "failure" : success()) }));
    expect(result.outcome).toBe("completed");
    expect(result.serviceAttempts).toBe(2);
    expect(result.serviceRetriesUsed).toBe(1);
  });

  it("fatal service failure → selects an eligible alternative (within the allowlist), as a new transaction", () => {
    const { ledger, result } = run("compliance", world({ service: (id) => (id === "vat-api" ? fatal() : success()) }));
    // compliance task prefers vat-api; it fails fatally → alternative sitehealth.
    expect(result.outcome).toBe("completed");
    expect(result.selectedServiceId).toBe("vat-api");
    // Two transactions: the original (vat-api, paid+failed) and the alternative (sitehealth, paid+completed).
    const txIds = [...new Set(ledger.entries.map((e) => e.txId))];
    expect(txIds).toContain("tx-1");
    expect(txIds).toContain("tx-1-alt");
    expect(ledger.entries.filter((e) => e.settlementStatus === "settled")).toHaveLength(2);
  });

  it("escalates when service retries are exhausted — paid but not delivered (dispute: refund requested)", () => {
    const { result, ledger } = run("security", world({ service: () => "failure" }));
    expect(result.outcome).toBe("escalated");
    expect(result.serviceAttempts).toBe(4); // 1 + maxServiceRetries 3
    expect(result.paymentsSettled).toBe(1); // payment happened
    expect(ledger.entries.some((e) => e.errorOrDispute === "service retries exhausted")).toBe(true);
    // The paid-but-not-delivered loss is recorded (refund path in the dispute model).
    expect(result.notes.some((n) => n.includes("refund requested"))).toBe(true);
  });

  it("service fatal with NO eligible alternative → escalate", () => {
    const { result } = run("tax", world({ service: () => fatal() })); // tax → vat-api only, no alternative
    expect(result.outcome).toBe("escalated");
    expect(result.selectedServiceId).toBe("vat-api");
  });
});

// ---------------------------------------------------------------------------
// Kill switch (§12)
// ---------------------------------------------------------------------------

describe("A1 kill switch", () => {
  it("aborts every payment while autonomous commerce is disabled — nothing is spent", () => {
    const policy: Policy = { ...A1_POLICY, killSwitch: { ...A1_POLICY.killSwitch, autonomousCommerceEnabled: false } };
    const { result, ledger } = run("security", world(), policy);
    // The kill flag is enforced at the policy gate (the earliest possible point).
    expect(result.outcome).toBe("aborted-kill");
    expect(result.paymentAttempts).toBe(0);
    expect(result.paymentsSettled).toBe(0);
    expect(ledger.entries.filter((e) => e.nonce !== null)).toHaveLength(0); // no payment actually issued
    expect(ledger.entries.some((e) => e.policyDecision === "rejected-kill")).toBe(true);
  });

  it("mid-flight kill: the pay-stage check freezes FURTHER payment issuance", () => {
    // The kill flag flips inside the first pay outcome (after attempt 1's pre-pay
    // check). Attempt 1 may already be issued (unverified); attempt 2's pre-pay
    // check must refuse to issue anything further.
    const policy: Policy = JSON.parse(JSON.stringify(A1_POLICY)) as Policy; // deep copy
    const { result, ledger } = run(
      "security",
      world({
        pay: () => {
          policy.killSwitch.autonomousCommerceEnabled = false; // kill flips mid-transaction
          return "pending";
        },
        verify: () => "failed",
      }),
      policy
    );
    expect(result.outcome).toBe("aborted-kill");
    expect(result.paymentsSettled).toBe(0); // nothing settled
    expect(ledger.paymentsFor("tx-1")).toHaveLength(1); // only attempt 1 issued; attempt 2 blocked
    expect(ledger.entries.filter((e) => e.errorOrDispute === "kill switch")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Ledger + reconciliation (§10 / §11)
// ---------------------------------------------------------------------------

describe("A1 ledger and reconciliation", () => {
  it("counts settled spend for the day/month windows from the ledger", () => {
    const { ledger } = run("security", world());
    const day = ledger.settledSpendCents("2026-08-20T00:00:00.000Z", NOW);
    const month = ledger.settledSpendCents("2026-08-01T00:00:00.000Z", NOW);
    expect(day).toBe(1);
    expect(month).toBe(1);
  });

  it("reconciliation flags a discrepancy between ledger spend and the wallet balance", () => {
    const { ledger } = run("security", world());
    const clean = ledger.reconcile(1, "2026-08-20T00:00:00.000Z", NOW);
    expect(clean.discrepancyCents).toBe(0);
    const dirty = ledger.reconcile(0, "2026-08-20T00:00:00.000Z", NOW);
    expect(dirty.discrepancyCents).toBe(1); // ledger says 1c spent, wallet says 0 — flagged
  });

  it("records a full §11 audit trail per completed transaction", () => {
    const { ledger } = run("security", world());
    const txEntries = ledger.entries.filter((e) => e.txId === "tx-1");
    // selection+policy, pay, service, close
    expect(txEntries.length).toBeGreaterThanOrEqual(4);
    const fields = txEntries[0];
    expect(fields).toHaveProperty("agentId", "agent-a");
    expect(fields).toHaveProperty("serviceId", "sitehealth");
    expect(fields).toHaveProperty("network", "simulation");
    expect(ledger.entries.find((e) => e.finalOutcome === "completed")).toBeDefined();
  });
});

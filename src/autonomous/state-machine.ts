/**
 * A1 simulation — deterministic autonomous transaction state machine (§7 of the plan)
 * with the §10 double-payment / ambiguous-settlement protection.
 *
 * Lifecycle: DISCOVER → IDENTIFY → CHECK ELIGIBILITY → OBTAIN PRICE → CHECK SPEND POLICY
 * → ACCEPT/REJECT → PAY → VERIFY SETTLEMENT → CONSUME SERVICE → VERIFY RESULT → CLOSE.
 * Failure paths: payment failure (retry ≤2 / ambiguous→verify / policy→abort), service
 * failure (retry ≤3 / alternative within allowlist / close+escalate).
 *
 * §10 invariants enforced here:
 *  - a new payment is issued only when no prior attempt exists or the prior is CONFIRMED
 *    failed (ledger.canIssuePayment) — never re-purchase on unknown/pending/settled;
 *  - "payment status unknown" triggers VERIFY SETTLEMENT, never another payment;
 *  - nonces are unique per attempt (EIP-3009 idempotency semantics);
 *  - the kill switch is checked immediately before every payment.
 *
 * Fully deterministic: all outcomes come from the injected `world`; time comes from the
 * fixed `now`. No randomness, no live endpoints.
 */
import type {
  LedgerLike,
  Policy,
  PolicyDecision,
  SettlementStatus,
  ServiceId,
  ServiceResult,
  TaskMap,
  TransactionInput,
  TransactionResult,
  TxOutcome,
  World,
} from "./types";

const dayOf = (iso: string) => iso.slice(0, 10);
const monthOf = (iso: string) => iso.slice(0, 7);

export class TransactionMachine {
  constructor(private ledger: LedgerLike) {}

  run(input: TransactionInput): TransactionResult {
    return this.runInternal(input, input.txId, 0, null);
  }

  private runInternal(input: TransactionInput, txId: string, depth: number, excludeServiceId: ServiceId | null): TransactionResult {
    const notes: string[] = [];
    const nonces: string[] = [];
    const base: TransactionResult = {
      outcome: "escalated",
      selectedServiceId: null,
      paymentAttempts: 0,
      paymentsSettled: 0,
      serviceAttempts: 0,
      paymentRetriesUsed: 0,
      serviceRetriesUsed: 0,
      nonces,
      notes,
    };
    if (depth > 3) {
      notes.push("alternative chain exceeded depth 3 — escalating");
      this.final(input, txId, null, "escalated", "alternative depth exceeded");
      return base;
    }

    // 1-2. DISCOVER + IDENTIFY: the eligible (non-disabled) services that satisfy the task.
    const candidates = this.selectServices(input, excludeServiceId);
    if (candidates.length === 0) {
      notes.push(`task "${input.task}" has no eligible service in the allowlist`);
      this.final(input, txId, null, "aborted-ineligible", "no eligible service for task");
      return { ...base, outcome: "aborted-ineligible" };
    }
    const service = candidates[0]; // preference order from the task map
    base.selectedServiceId = service.id;
    notes.push(`selected service ${service.id} for task "${input.task}" (${service.canonicalUrl})`);

    // 3. CHECK ELIGIBILITY (allowlist + not disabled).
    if (input.policy.killSwitch.disabledServices.includes(service.id)) {
      notes.push(`service ${service.id} is disabled by policy`);
      this.final(input, txId, service.id, "aborted-ineligible", "service disabled");
      return { ...base, outcome: "aborted-ineligible" };
    }

    // 4. OBTAIN PRICE (in A1, from the allowlist; live 402 challenge at A3+).
    const price = service.priceCents;

    // 5. CHECK SPEND POLICY (per-tx, per-service, daily, monthly; kill flag).
    const decision = this.checkSpendPolicy(input, service.id, price, txId);
    this.ledger.record({
      txId, agentId: input.agentId, serviceId: service.id, request: input.task,
      quotedPriceCents: price, policyLimitCents: Math.min(input.policy.ceilings.perTxCents, service.maxPerTxCents),
      policyDecision: decision, paymentAttempt: null, nonce: null, network: "simulation",
      settlementStatus: null, serviceResult: null, retryCount: 0, finalOutcome: null,
      timestamp: input.now, errorOrDispute: decision === "accepted" ? null : `policy: ${decision}`,
    });
    if (decision !== "accepted") {
      notes.push(`policy rejected: ${decision} (price ${price}c)`);
      const outcome: TxOutcome = decision === "rejected-kill" ? "aborted-kill" : "aborted-policy";
      this.final(input, txId, service.id, outcome, `policy decision: ${decision}`);
      return { ...base, outcome, notes };
    }
    notes.push(`price ${price}c accepted (≤ per-tx ${input.policy.ceilings.perTxCents}c, per-service ${service.maxPerTxCents}c)`);

    // 7-8. PAY + VERIFY SETTLEMENT (with §10 protection).
    const payResult = this.payWithRetries(input, service.id, price, txId, nonces, notes);
    base.paymentAttempts = payResult.attempts;
    base.paymentRetriesUsed = Math.max(0, payResult.attempts - 1);
    if (payResult.settled === 0) {
      const outcome: TxOutcome = payResult.verificationRequiredButKilled ? "aborted-kill" : "escalated";
      this.final(input, txId, service.id, outcome, payResult.note ?? "payment could not be settled");
      return { ...base, outcome, notes };
    }
    base.paymentsSettled = payResult.settled;

    // 9. CONSUME SERVICE (retries + alternative within the allowlist).
    const consume = this.consumeWithRetries(input, service.id, txId, nonces, notes);
    base.serviceAttempts = consume.attempts;
    base.serviceRetriesUsed = Math.max(0, consume.attempts - 1);

    if (consume.result === "success") {
      // 10-11. VERIFY RESULT + CLOSE.
      notes.push("service result verified — closing transaction");
      this.final(input, txId, service.id, "completed", null);
      return { ...base, outcome: "completed", notes };
    }

    // SERVICE FAILURE path: alternative within the allowlist (excluding the failed
    // service), else escalate.
    const alternatives = candidates.filter((c) => c.id !== service.id);
    if (consume.result === "fatal" && alternatives.length > 0) {
      const alt = alternatives[0];
      notes.push(`service ${service.id} fatal — selecting alternative ${alt.id} (new transaction)`);
      const altResult = this.runInternal(input, `${txId}-alt`, depth + 1, service.id);
      this.final(input, txId, service.id, altResult.outcome, `alternative selected: ${alt.id}`);
      return { ...base, outcome: altResult.outcome, notes };
    }
    notes.push(consume.result === "fatal" ? "service fatal, no eligible alternative — escalating" : "service retries exhausted — escalating (paid but not delivered; dispute: refund requested)");
    this.final(input, txId, service.id, "escalated", consume.result === "fatal" ? "service fatal, no alternative" : "service retries exhausted");
    return { ...base, outcome: "escalated", notes };
  }

  private selectServices(input: TransactionInput, excludeServiceId: ServiceId | null = null) {
    // Order follows the TASK's preference (taskMap), not the allowlist order.
    const taskServices: string[] = input.taskMap[input.task] ?? [];
    const byId = new Map(input.policy.eligibleServices.map((s) => [s.id, s]));
    return taskServices
      .map((id) => byId.get(id as ServiceId))
      .filter((s): s is NonNullable<typeof s> => s !== undefined && s.id !== excludeServiceId);
  }

  private checkSpendPolicy(input: TransactionInput, serviceId: ServiceId, price: number, txId: string): PolicyDecision {
    const c = input.policy.ceilings;
    if (!input.policy.killSwitch.autonomousCommerceEnabled) return "rejected-kill";
    if (price > c.perTxCents) return "rejected-per-tx";
    if (price > c.perServiceCents[serviceId]) return "rejected-per-service";
    const day = dayOf(input.now);
    const month = monthOf(input.now);
    const daily = this.ledger.settledSpendCents(`${day}T00:00:00.000Z`, input.now);
    const monthly = this.ledger.settledSpendCents(`${month}-01T00:00:00.000Z`, input.now);
    if (daily + price > c.dailyCents) return "rejected-daily";
    if (monthly + price > c.monthlyCents) return "rejected-monthly";
    return "accepted";
  }

  /**
   * PAY with retries. Core §10 behavior:
   *  - attempt outcomes come from the injected world;
   *  - "failed" → retry (≤ maxPaymentRetries) with a NEW nonce (a fresh payment attempt);
   *  - "pending"/"unknown" (ambiguous) → VERIFY SETTLEMENT: if settled → proceed (NEVER
   *    re-pay); if failed → retry;
   *  - the ledger guard refuses any payment while a prior attempt is not confirmed failed.
   */
  private payWithRetries(
    input: TransactionInput, serviceId: ServiceId, price: number, txId: string, nonces: string[], notes: string[]
  ): { attempts: number; settled: number; note?: string; verificationRequiredButKilled?: boolean } {
    const maxAttempts = 1 + input.policy.retryLimits.maxPaymentRetries;
    let attempts = 0;
    let settled = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attempts = attempt;
      // Kill switch check immediately before every payment.
      if (!input.policy.killSwitch.autonomousCommerceEnabled) {
        notes.push("kill switch active — payment aborted");
        this.ledger.record({ txId, agentId: input.agentId, serviceId, request: input.task, quotedPriceCents: price, policyLimitCents: null, policyDecision: "rejected-kill", paymentAttempt: attempt, nonce: null, network: "simulation", settlementStatus: null, serviceResult: null, retryCount: attempt - 1, finalOutcome: "aborted-kill", timestamp: input.now, errorOrDispute: "kill switch" });
        return { attempts, settled: 0, note: "killed", verificationRequiredButKilled: true };
      }
      // §10 duplicate-payment guard.
      const guard = this.ledger.canIssuePayment(txId);
      if (!guard.ok) {
        notes.push(`duplicate-payment prevented: ${guard.reason}`);
        this.ledger.record({ txId, agentId: input.agentId, serviceId, request: input.task, quotedPriceCents: price, policyLimitCents: null, policyDecision: "rejected-per-tx", paymentAttempt: attempt, nonce: null, network: "simulation", settlementStatus: null, serviceResult: null, retryCount: attempt - 1, finalOutcome: "duplicate-payment-prevented", timestamp: input.now, errorOrDispute: guard.reason ?? null });
        return { attempts, settled: 0, note: guard.reason };
      }
      // Fresh nonce per attempt (EIP-3009 idempotency).
      const nonce = `${txId}:pay:${attempt}`;
      if (this.ledger.nonceUsed(nonce)) throw new Error(`nonce reuse detected: ${nonce}`);
      nonces.push(nonce);

      const outcome: SettlementStatus = input.world.paymentOutcome(serviceId, attempt);
      this.ledger.record({ txId, agentId: input.agentId, serviceId, request: input.task, quotedPriceCents: price, policyLimitCents: Math.min(input.policy.ceilings.perTxCents, price), policyDecision: "accepted", paymentAttempt: attempt, nonce, network: "simulation", settlementStatus: outcome, serviceResult: null, retryCount: attempt - 1, finalOutcome: null, timestamp: input.now, errorOrDispute: outcome === "settled" || outcome === "failed" ? null : `ambiguous: ${outcome}` });
      notes.push(`pay attempt ${attempt}: ${outcome} (nonce ${nonce})`);

      if (outcome === "settled") {
        settled++;
        return { attempts, settled };
      }
      if (outcome === "failed") {
        notes.push(`payment failed on attempt ${attempt}`);
        continue; // retry (new nonce)
      }
      // pending / unknown → VERIFY SETTLEMENT (never re-pay).
      notes.push(`settlement ambiguous (${outcome}) on attempt ${attempt} — verifying before any further payment`);
      const verified = input.world.verifySettlement(serviceId, attempt);
      this.ledger.record({ txId, agentId: input.agentId, serviceId, request: input.task, quotedPriceCents: price, policyLimitCents: null, policyDecision: null, paymentAttempt: attempt, nonce: null, network: "simulation", settlementStatus: verified === "settled" ? "settled" : "failed", serviceResult: null, retryCount: attempt - 1, finalOutcome: null, timestamp: input.now, errorOrDispute: `settlement verified: ${verified}` });
      notes.push(`settlement verified: ${verified}`);
      if (verified === "settled") {
        settled++;
        return { attempts, settled, note: "settled after verification — no re-purchase" };
      }
      // verified failed → retry allowed (new payment, new nonce).
      notes.push(`verified failed on attempt ${attempt} — retry permitted`);
    }
    return { attempts, settled: 0, note: "payment retries exhausted" };
  }

  private consumeWithRetries(
    input: TransactionInput, serviceId: ServiceId, txId: string, _nonces: string[], notes: string[]
  ): { attempts: number; result: ServiceResult } {
    const maxAttempts = 1 + input.policy.retryLimits.maxServiceRetries;
    let attempts = 0;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attempts = attempt;
      const result: ServiceResult = input.world.serviceOutcome(serviceId, attempt);
      this.ledger.record({ txId, agentId: input.agentId, serviceId, request: input.task, quotedPriceCents: null, policyLimitCents: null, policyDecision: null, paymentAttempt: null, nonce: null, network: "simulation", settlementStatus: null, serviceResult: result, retryCount: null, finalOutcome: null, timestamp: input.now, errorOrDispute: result === "success" ? null : `service attempt ${attempt}: ${result}` });
      notes.push(`service attempt ${attempt}: ${result}`);
      if (result === "success") return { attempts, result: "success" };
      if (result === "fatal") return { attempts, result: "fatal" };
      // failure → retry
    }
    return { attempts, result: "failure" };
  }

  private final(input: TransactionInput, txId: string, serviceId: ServiceId | null, outcome: TxOutcome, errorOrDispute: string | null) {
    this.ledger.record({ txId, agentId: input.agentId, serviceId, request: input.task, quotedPriceCents: null, policyLimitCents: null, policyDecision: null, paymentAttempt: null, nonce: null, network: "simulation", settlementStatus: null, serviceResult: null, retryCount: null, finalOutcome: outcome, timestamp: input.now, errorOrDispute });
  }
}

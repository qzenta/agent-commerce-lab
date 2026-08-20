/**
 * A1 simulation — autonomous agent-commerce types (QZENTA-AUTONOMOUS-AGENT-COMMERCE-PLAN v1).
 * Money is integer USDC cents to avoid float error (same convention as batch pricing).
 */

export type ServiceId = "sitehealth" | "vat-api";

export interface EligibleService {
  id: ServiceId;
  canonicalUrl: string;
  /** Merchant `payTo` the agent verifies before paying (anti-spoof). */
  payTo: string;
  /** Simulated quoted price in USDC cents (the live 402 challenge would be the source in A3+). */
  priceCents: number;
  /** Per-service per-transaction ceiling in cents (policy). */
  maxPerTxCents: number;
}

export interface SpendingCeilings {
  perTxCents: number; // global per-transaction
  dailyCents: number;
  monthlyCents: number;
  perServiceCents: Record<ServiceId, number>;
}

export interface RetryLimits {
  maxPaymentRetries: number; // additional attempts after the first
  maxServiceRetries: number;
}

export interface KillSwitchState {
  autonomousCommerceEnabled: boolean;
  disabledServices: ServiceId[];
}

export interface Policy {
  version: number;
  eligibleServices: EligibleService[];
  ceilings: SpendingCeilings;
  retryLimits: RetryLimits;
  killSwitch: KillSwitchState;
}

export type SettlementStatus = "settled" | "pending" | "failed" | "unknown";
export type ServiceResult = "success" | "failure" | "fatal";
export type PolicyDecision = "accepted" | "rejected-per-tx" | "rejected-per-service" | "rejected-daily" | "rejected-monthly" | "rejected-ineligible" | "rejected-kill";

export type TxOutcome =
  | "completed"
  | "aborted-ineligible"
  | "aborted-policy"
  | "aborted-kill"
  | "escalated" // service failed beyond retries, no alternative
  | "duplicate-payment-prevented"; // machine refused a second pay before settlement confirmed failed

/** §11 autonomous transaction ledger entry (append-only). */
export interface LedgerEntry {
  entryId: number;
  txId: string; // agent-generated transaction identifier
  agentId: string;
  serviceId: ServiceId | null;
  request: string; // task/request descriptor
  quotedPriceCents: number | null;
  policyLimitCents: number | null;
  policyDecision: PolicyDecision | null;
  paymentAttempt: number | null; // 1-based
  nonce: string | null; // EIP-3009 nonce (idempotency key) — unique per pay attempt
  network: string; // "base-sepolia" (A2) / "simulation" (A1)
  settlementStatus: SettlementStatus | null;
  serviceResult: ServiceResult | null;
  retryCount: number | null; // payment retries used at this point
  finalOutcome: TxOutcome | null;
  timestamp: string; // ISO — deterministic in A1 (fixed `now`)
  errorOrDispute: string | null;
}

export interface TaskMap {
  [task: string]: ServiceId[]; // preference order; [] = no eligible service
}

/** Structural ledger interface (avoids a circular import with ledger.ts). */
export interface LedgerLike {
  record(entry: Omit<LedgerEntry, "entryId">): LedgerEntry;
  settledSpendCents(since: string, until: string): number;
  paymentsFor(txId: string): LedgerEntry[];
  lastPaymentFor(txId: string): LedgerEntry | null;
  canIssuePayment(txId: string): { ok: boolean; reason?: string };
  nonceUsed(nonce: string): boolean;
  reconcile(walletBalanceCents: number, since: string, until: string): { ledgerSettledCents: number; walletBalanceCents: number; discrepancyCents: number };
}

export interface World {
  /** Deterministic payment outcome per attempt (scenario-injected). */
  paymentOutcome: (serviceId: ServiceId, attempt: number) => SettlementStatus;
  /** Resolves an ambiguous/pending settlement (scenario-injected). */
  verifySettlement: (serviceId: ServiceId, attempt: number) => "settled" | "failed";
  /** Deterministic service execution outcome per attempt (scenario-injected). */
  serviceOutcome: (serviceId: ServiceId, attempt: number) => ServiceResult;
}

export interface TransactionInput {
  txId: string;
  agentId: string;
  task: string;
  policy: Policy;
  taskMap: TaskMap;
  ledger: LedgerLike;
  world: World;
  now: string; // ISO timestamp — fixed for determinism
}

export interface TransactionResult {
  outcome: TxOutcome;
  selectedServiceId: ServiceId | null;
  paymentAttempts: number;
  paymentsSettled: number;
  serviceAttempts: number;
  paymentRetriesUsed: number;
  serviceRetriesUsed: number;
  nonces: string[];
  notes: string[];
}

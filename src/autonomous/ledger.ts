/**
 * A1 simulation — append-only transaction ledger (§11). Spend counters are derived
 * from settled ledger rows within date windows (deterministic: timestamps come from
 * the fixed `now` of each transaction). Reconciliation compares ledger-settled spend
 * against a wallet balance (simulated) — every discrepancy is surfaced, never silently
 * corrected.
 */
import type { LedgerEntry } from "./types";

export class Ledger {
  private nextEntryId = 1;
  readonly entries: LedgerEntry[] = [];

  /** Append-only record of a state transition. Timestamps are caller-supplied (deterministic in A1). */
  record(entry: Omit<LedgerEntry, "entryId">): LedgerEntry {
    const full: LedgerEntry = { ...entry, entryId: this.nextEntryId++ };
    this.entries.push(full);
    return full;
  }

  /** Settled spend within [since, until] (inclusive of `until`). */
  settledSpendCents(since: string, until: string): number {
    return this.entries
      .filter((e) => e.settlementStatus === "settled" && e.timestamp >= since && e.timestamp <= until)
      .reduce((sum, e) => sum + (e.quotedPriceCents ?? 0), 0);
  }

  /** Every PAY issued for a txId (a payment has a nonce; settlement-verification and
   *  kill/duplicate records carry paymentAttempt but no nonce and are NOT payments). */
  paymentsFor(txId: string): LedgerEntry[] {
    return this.entries.filter((e) => e.txId === txId && e.paymentAttempt !== null && e.nonce !== null);
  }

  /** The most recent payment-related event for a txId (a pay attempt OR its
   *  settlement-verification record, which resolves the status). */
  lastPaymentFor(txId: string): LedgerEntry | null {
    const pays = this.entries.filter((e) => e.txId === txId && e.paymentAttempt !== null);
    return pays.length === 0 ? null : pays[pays.length - 1];
  }

  /** Duplicate-payment guard: a new pay is allowed only if there is no prior attempt,
   *  or the prior attempt is CONFIRMED failed (settled is never re-paid; unknown/pending
   *  must be verified first — §10). */
  canIssuePayment(txId: string): { ok: boolean; reason?: string } {
    const last = this.lastPaymentFor(txId);
    if (!last) return { ok: true };
    if (last.settlementStatus === "failed") return { ok: true };
    if (last.settlementStatus === "settled") return { ok: false, reason: "already settled — never re-pay a settled transaction" };
    return { ok: false, reason: `prior payment status is ${last.settlementStatus} — must verify settlement before any further payment (never re-purchase on unknown)` };
  }

  /** Nonce uniqueness: EIP-3009 nonces are usable once on-chain; a reuse is a defect. */
  nonceUsed(nonce: string): boolean {
    return this.entries.some((e) => e.nonce === nonce);
  }

  /** Reconciliation: ledger-settled spend vs a (simulated) wallet balance. */
  reconcile(walletBalanceCents: number, since: string, until: string): { ledgerSettledCents: number; walletBalanceCents: number; discrepancyCents: number } {
    const ledgerSettledCents = this.settledSpendCents(since, until);
    return {
      ledgerSettledCents,
      walletBalanceCents,
      discrepancyCents: ledgerSettledCents - walletBalanceCents,
    };
  }
}

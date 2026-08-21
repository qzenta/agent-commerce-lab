/**
 * A2 — Live testnet World: replaces A1's scripted outcomes with REAL fetch() calls to
 * the VAT API staging endpoint (x402-gated on base-sepolia) and REAL on-chain checks.
 *
 * The state machine stays identical to A1 (§7/§10); only the World implementation changes.
 *
 * Boundary: testnet only, no real currency. The payer wallet is UNFUNDED in this phase —
 * the payment exchange therefore cannot settle; its failure path and the
 * ambiguous→verify→failed flow are exercised for real. `createSigner` is imported from a
 * deep path (x402@1.2.0, lockfile-pinned) because the package does not export it at the root.
 */
import { createPaymentHeader, selectPaymentRequirements } from "x402/client";
import { createSigner } from "x402/types";
import { createPublicClient, http, type Address } from "viem";
import type { ServiceId, ServiceResult, SettlementStatus, World } from "./types";

export const VAT_API_STAGING = "https://sikatrix-vat-api-staging.qzenta.workers.dev";
export const VAT_API_PAID_ROUTE = "/calculate";
export const USDC_BASE_SEPOLIA: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const BASE_SEPOLIA_RPC = "https://sepolia.base.org";

/** Example request body for the VAT API /calculate route (schema TBD at the funded run). */
export const VAT_REQUEST_BODY = { period: "2026-07", netAmount: 1000, vatRate: 15 };

const BALANCE_ABI = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;

export interface LiveWorldOptions {
  payerKey: string;
  vatApiBase?: string;
  paidRoute?: string;
  rpcUrl?: string;
  log: (line: string) => void;
}

export class LiveWorld implements World {
  private signer: Awaited<ReturnType<typeof createSigner>> | null = null;
  private lastService: { status: number; body: string } | null = null;
  private exchangeErrors: string[] = [];
  private publicClient: ReturnType<typeof createPublicClient> | null = null;

  constructor(private opts: LiveWorldOptions) {}

  private async signerFor() {
    if (!this.signer) {
      this.signer = await createSigner("base-sepolia", this.opts.payerKey);
    }
    return this.signer;
  }

  private client() {
    if (!this.publicClient) this.publicClient = createPublicClient({ transport: http(this.opts.rpcUrl ?? BASE_SEPOLIA_RPC) });
    return this.publicClient;
  }

  async payerUsdcBalance(): Promise<bigint> {
    const signer = await this.signerFor();
    // createSigner("base-sepolia", …) returns an EVM signer wallet with a viem account.
    const payer = (signer as unknown as { account: { address: Address } }).account.address;
    const balance = await this.client().readContract({ address: USDC_BASE_SEPOLIA, abi: BALANCE_ABI, functionName: "balanceOf", args: [payer] });
    return balance;
  }

  /**
   * The REAL x402 payment exchange: fetch the 402 challenge → select requirements →
   * sign + submit via the facilitator → retry with the X-PAYMENT header.
   * Outcome mapping: 200 = settled (+ service result captured); 402-after-payment =
   * failed; an exchange error (facilitator/network) = UNKNOWN → the machine MUST verify
   * on-chain before any further payment (§10).
   */
  async paymentOutcome(serviceId: ServiceId, attempt: number): Promise<SettlementStatus> {
    const base = this.opts.vatApiBase ?? VAT_API_STAGING;
    const route = this.opts.paidRoute ?? VAT_API_PAID_ROUTE;
    this.opts.log(`A2 pay attempt ${attempt} — POST ${base}${route}`);

    const challengeRes = await fetch(base + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(VAT_REQUEST_BODY) });
    const challengeText = await challengeRes.text();
    if (challengeRes.status !== 402) {
      this.opts.log(`A2 pay attempt ${attempt} — expected 402 challenge, got ${challengeRes.status}: ${challengeText.slice(0, 160)}`);
      return "failed";
    }
    const challenge = JSON.parse(challengeText) as { accepts: Array<Record<string, unknown>> };
    const reqs = selectPaymentRequirements(challenge.accepts as unknown as Parameters<typeof selectPaymentRequirements>[0], "base-sepolia", "exact");
    this.opts.log(`A2 pay attempt ${attempt} — challenge: ${JSON.stringify(reqs).slice(0, 220)}`);

    try {
      const header = await createPaymentHeader(await this.signerFor(), 1, reqs);
      this.opts.log(`A2 pay attempt ${attempt} — payment header created (facilitator submission attempted)`);
      const res = await fetch(base + route, {
        method: "POST",
        headers: { "content-type": "application/json", "X-PAYMENT": header },
        body: JSON.stringify(VAT_REQUEST_BODY),
      });
      const body = await res.text();
      this.lastService = { status: res.status, body };
      this.opts.log(`A2 pay attempt ${attempt} — retry status ${res.status}: ${body.slice(0, 200)}`);
      return res.status === 200 ? "settled" : "failed";
    } catch (err) {
      // Facilitator/network error mid-exchange: the settlement state is UNKNOWN.
      const msg = err instanceof Error ? err.message : String(err);
      this.exchangeErrors.push(msg);
      this.opts.log(`A2 pay attempt ${attempt} — exchange error (settlement unknown): ${msg.slice(0, 220)}`);
      return "unknown";
    }
  }

  /** REAL on-chain settlement verification: the payer's USDC balance on base-sepolia. */
  async verifySettlement(serviceId: ServiceId, attempt: number): Promise<"settled" | "failed"> {
    const balance = await this.payerUsdcBalance();
    this.opts.log(`A2 verify settlement (attempt ${attempt}) — payer USDC balance on base-sepolia: ${balance} (${balance > 0n ? "settled" : "failed"})`);
    return balance > 0n ? "settled" : "failed";
  }

  async serviceOutcome(serviceId: ServiceId, attempt: number): Promise<ServiceResult> {
    const r = this.lastService;
    if (!r) return "failure";
    if (r.status === 200) {
      try {
        const j = JSON.parse(r.body) as { success?: boolean };
        if (j.success === false) return "failure";
      } catch {
        // non-JSON 200 — treat as delivered
      }
      return "success";
    }
    return "failure";
  }

  exchangeErrorLog(): string[] {
    return this.exchangeErrors;
  }
}

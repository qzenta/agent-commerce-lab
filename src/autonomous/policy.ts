/**
 * A1 simulation — approved standing policy as A1/A2 DESIGN values only.
 * The ceilings here are the approved *design* ceilings ("not binding, revisit with
 * real cost data before A3" — per Daniel's A1 authorization). The VAT API price is
 * a placeholder ($0.01 = 1 cent): the real VAT API price is UNKNOWN until golden-case
 * validation completes. Nothing here is enforced against a live system.
 */
import type { Policy, ServiceId } from "./types";

export const SITEHEALTH_PAYTO = "0x1866Fd80B1196AcC70A98a50917A8FD4639FE823"; // testnet merchant wallet (test USDC)
export const VAT_API_PAYTO = SITEHEALTH_PAYTO; // placeholder — the VAT API's merchant address is UNKNOWN; A2 will set the real one

export const A1_POLICY: Policy = {
  version: 1,
  eligibleServices: [
    {
      id: "sitehealth",
      canonicalUrl: "https://sitehealth.qzenta.com",
      payTo: SITEHEALTH_PAYTO,
      priceCents: 1, // $0.01 (production-live price)
      maxPerTxCents: 100, // $1.00 per-tx SiteHealth ceiling (approved design value)
    },
    {
      id: "vat-api",
      canonicalUrl: "https://vat-api.qzenta.workers.dev", // placeholder canonical URL — UNKNOWN, set at A2
      payTo: VAT_API_PAYTO,
      priceCents: 1, // $0.01 placeholder — actual VAT API price UNKNOWN
      maxPerTxCents: 25, // $0.25 per-tx VAT API ceiling (approved design value)
    },
  ],
  ceilings: {
    perTxCents: 100, // $1.00 global per-transaction
    dailyCents: 500, // $5.00 daily
    monthlyCents: 5000, // $50.00 monthly
    perServiceCents: { sitehealth: 100, "vat-api": 25 },
  },
  retryLimits: {
    maxPaymentRetries: 2, // max 2 payment retries (§9)
    maxServiceRetries: 3, // max 3 service retries (§9)
  },
  killSwitch: {
    autonomousCommerceEnabled: true,
    disabledServices: [],
  },
};

/** Task → eligible services (preference order). Only allowlisted services appear. */
export const A1_TASKS: Record<string, ServiceId[]> = {
  security: ["sitehealth"], // SiteHealth = security/compliance-content check
  tax: ["vat-api"], // VAT API = tax verification
  compliance: ["vat-api", "sitehealth"], // both eligible; preference vat-api — exercises alternative selection
  admin: [], // ineligible task — nothing in the allowlist satisfies it
};

/**
 * Approved ZA compliance-figure seed (Gate 1 ruling D3, 20 Aug 2026).
 *
 * Every row here was approved by Daniel Amoah on 2026-08-20 — DSH does not modify
 * or re-interpret these values anywhere in the pipeline; they are load-time data.
 * Rows become loadable only via scripts/load-ground-truth.ts (which also records
 * the same approver metadata on insert).
 *
 * Source-tier note: all rows are tier 2 (official SARS regulator pages / the
 * ruling's cited sources). If gazette/statutory references become available they
 * should replace these refs and the tier bumped to 1 — a human decision.
 *
 * Superseded rows: NONE are seeded in P0. The schema and classification support
 * figure-stale detection via applies_until windows (proven by tests with
 * synthetic data), but no attested effective-date boundary beyond the five
 * approved facts exists in the sources we hold, so no superseded row is asserted.
 * Pre-1-Apr-2026 values (e.g. "R1 000 000" for the VAT threshold) are therefore
 * caught by context patterns as figure-mismatch rather than figure-stale.
 */

import type { GroundTruthFact, FactPattern } from "../src/ground-truth";

export const APPROVED_BY = "Daniel Amoah";
export const APPROVED_AT = "2026-08-20";
export const JURISDICTION = "ZA";

export const ZA_COMPLIANCE_FACTS: GroundTruthFact[] = [
  {
    factKey: "za.vat.mandatory_threshold_zar",
    label: "VAT compulsory registration threshold",
    value: "2300000",
    unit: "ZAR/year",
    jurisdiction: JURISDICTION,
    impactClass: "compliance-threshold",
    appliesFrom: "2026-04-01",
    appliesUntil: null,
    sourceTier: 2,
    sourceRef:
      "SARS announcement: VAT compulsory registration threshold increased from R1,000,000 to R2,300,000 effective 1 April 2026 (approved by Daniel Amoah, Gate 1 ruling D3, 20 Aug 2026)",
    approvedBy: APPROVED_BY,
    approvedAt: APPROVED_AT,
    notes:
      "Value corrected on sikatrix.com in Cycle 2 (commits c747bca, 672bdcb). No superseded R1,000,000 row seeded in P0 (no attested effective-date boundary for the old value).",
  },
  {
    factKey: "za.uif.monthly_ceiling_zar",
    label: "UIF monthly remuneration ceiling",
    value: "17712",
    unit: "ZAR/month",
    jurisdiction: JURISDICTION,
    impactClass: "money",
    appliesFrom: "2026-08-20",
    appliesUntil: null,
    sourceTier: 2,
    sourceRef:
      "SARS UIF monthly remuneration ceiling R17,712 (value fixed on sikatrix.com in Cycle 2, commit c747bca; approved by Daniel Amoah, Gate 1 ruling D3, 20 Aug 2026)",
    approvedBy: APPROVED_BY,
    approvedAt: APPROVED_AT,
    notes:
      "appliesFrom is the approval date: no supersession boundary for this figure was captured in the approved sources.",
  },
  {
    factKey: "za.coida.roe_deadline",
    label: "ROE (Return of Earnings) submission deadline",
    value: "06-30",
    unit: "month-day",
    jurisdiction: JURISDICTION,
    impactClass: "compliance-deadline",
    appliesFrom: "2026-08-20",
    appliesUntil: null,
    sourceTier: 2,
    sourceRef:
      "COIDA Return of Earnings deadline 30 June, gazetted date (applied on sikatrix.com in Cycle 2, commit 7d8b759 after external confirmation; approved by Daniel Amoah, Gate 1 ruling D3, 20 Aug 2026)",
    approvedBy: APPROVED_BY,
    approvedAt: APPROVED_AT,
    notes:
      "The 31 March value some pages state is caught as figure-mismatch (critical, compliance-deadline) in P0; a superseded row may be approved later with an attested boundary.",
  },
  {
    factKey: "za.emp501.reconciliation_end",
    label: "EMP501 annual reconciliation window end",
    value: "05-31",
    unit: "month-day",
    jurisdiction: JURISDICTION,
    impactClass: "compliance-deadline",
    appliesFrom: "2026-08-20",
    appliesUntil: null,
    sourceTier: 2,
    sourceRef:
      "EMP501 annual reconciliation window end 31 May (corrected on sikatrix.com in Cycle 2, commit c747bca; approved by Daniel Amoah, Gate 1 ruling D3, 20 Aug 2026)",
    approvedBy: APPROVED_BY,
    approvedAt: APPROVED_AT,
    notes: "A stale '25 June' or 'August/February' cadence is caught as figure-mismatch in P0.",
  },
  {
    factKey: "za.vat.voluntary_threshold_zar",
    label: "VAT voluntary registration threshold",
    value: "120000",
    unit: "ZAR/year",
    jurisdiction: JURISDICTION,
    impactClass: "compliance-threshold",
    appliesFrom: "2026-04-01",
    appliesUntil: null,
    sourceTier: 2,
    sourceRef:
      "SARS Budget 2026 FAQ (sars.gov.za) — per Daniel Amoah Gate 1 ruling D3, 20 Aug 2026 (resolves the R50,000 vs R120,000 conflict found on sikatrix.com)",
    approvedBy: APPROVED_BY,
    approvedAt: APPROVED_AT,
    notes: "Ruling D3 fixed the correct value as R120,000 effective 1 April 2026.",
  },
];

/**
 * Match patterns per fact. Kinds:
 *  - 'value': matches a known figure directly (low false-positive; amount-specific).
 *  - 'context': keyword-windowed capture; group 1 is the money/date expression used
 *    for normalization. Powers figure-mismatch detection (any figure in the fact's
 *    context that is not the approved value).
 *  - 'keyword': topic words; powers absent-required-figure detection.
 *
 * Money facts get value + context + keyword patterns. Deadline facts get
 * context + keyword only (bare date phrases like "30 June" are too ambiguous to
 * match without a topic window — a page saying "interest runs to 30 June" must
 * not trip the ROE fact).
 */
export const ZA_COMPLIANCE_PATTERNS: FactPattern[] = [
  // --- za.vat.mandatory_threshold_zar (value 2300000) ---
  { factKey: "za.vat.mandatory_threshold_zar", kind: "keyword", pattern: "\\b(?:VAT|value[- ]added tax)\\b", priority: 1 },
  { factKey: "za.vat.mandatory_threshold_zar", kind: "context", pattern: "(?:compulsory|mandatory|must register|required to register|registration threshold)[^.]{0,140}?R\\s*(\\d[\\d\\s.,]*(?:m|million|k|thousand)?)", priority: 5 },
  { factKey: "za.vat.mandatory_threshold_zar", kind: "value", pattern: "R\\s*2\\s*[.,]?\\s*3\\s*m(?:illion)?\\b", priority: 10 },
  { factKey: "za.vat.mandatory_threshold_zar", kind: "value", pattern: "R\\s*2[\\s,.]*300[\\s,.]*000\\b", priority: 20 },

  // --- za.uif.monthly_ceiling_zar (value 17712) ---
  { factKey: "za.uif.monthly_ceiling_zar", kind: "keyword", pattern: "\\b(?:UIF|unemployment insurance)\\b", priority: 1 },
  { factKey: "za.uif.monthly_ceiling_zar", kind: "context", pattern: "(?:UIF|unemployment insurance)[^.]{0,140}?R\\s*(\\d[\\d\\s.,]*(?:m|million|k|thousand)?)", priority: 5 },
  { factKey: "za.uif.monthly_ceiling_zar", kind: "value", pattern: "R\\s*17\\s*[.,]?\\s*712\\b", priority: 10 },
  { factKey: "za.uif.monthly_ceiling_zar", kind: "value", pattern: "R\\s*17[\\s,.]*712\\b", priority: 20 },

  // --- za.vat.voluntary_threshold_zar (value 120000) ---
  { factKey: "za.vat.voluntary_threshold_zar", kind: "context", pattern: "(?:voluntarily register|voluntary registration|optional registration)[^.]{0,140}?R\\s*(\\d[\\d\\s.,]*(?:m|million|k|thousand)?)", priority: 5 },
  { factKey: "za.vat.voluntary_threshold_zar", kind: "value", pattern: "R\\s*120[\\s,.]*000\\b", priority: 10 },
  { factKey: "za.vat.voluntary_threshold_zar", kind: "value", pattern: "R\\s*120\\s*k\\b", priority: 20 },

  // --- za.coida.roe_deadline (value 06-30) ---
  { factKey: "za.coida.roe_deadline", kind: "keyword", pattern: "\\b(?:return of earnings|COIDA)\\b", priority: 1 },
  { factKey: "za.coida.roe_deadline", kind: "context", pattern: "(?:return of earnings|COIDA|ROE)[^.]{0,140}?(\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december))", priority: 5 },

  // --- za.emp501.reconciliation_end (value 05-31) ---
  { factKey: "za.emp501.reconciliation_end", kind: "keyword", pattern: "\\bEMP501\\b", priority: 1 },
  { factKey: "za.emp501.reconciliation_end", kind: "context", pattern: "(?:EMP501|annual reconciliation)[^.]{0,140}?(\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december))", priority: 5 },
];

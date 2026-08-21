## SiteHealth Scanner Finding — Fact-Extraction False Positive

**Date:** 21 Aug 2026
**Reported by:** Daniel (independent verification against qzenta/sikatrix source)
**Affects:** findingKey `cross-page-contradiction:za.uif.monthly_ceiling_zar`,
`figure-mismatch:za.uif.monthly_ceiling_zar` on domain www.sikatrix.com

## Summary

Two findings marked critical (177 vs approved 17712) do NOT correspond to a real
content defect on the scanned site. Root cause is in the scanner's fact-matching
logic, not the target page.

## Verification performed

Fetched `components/tools/TaxCalculator.tsx` directly from qzenta/sikatrix (main).
`uifMonthCap: 17712` is set correctly across all three tax-year data blocks
(2024/25, 2025/26, 2026/27). No typo, no dropped digits, no stale value.

## What the scanner actually saw

The page never renders the raw ceiling (17712) as static text. It only uses it as
a calculation input:

    uifMonthly = Math.min(income / 12, uifMonthCap) * uifRate

For any user-entered annual income ≥ ~R212,544, this evaluates to
17712 × 0.01 = 177.12, displayed (rounded) as "R 177" under the "UIF contribution"
result box.

## Hypothesis

The scanner interacted with the calculator (or captured a rendered state with a
qualifying income entered), saw "177" positioned near UIF-related copy, and
matched it against factKey `za.uif.monthly_ceiling_zar` — treating a *derived,
input-dependent output value* as if it were a *stated fact* about the ceiling
itself. The two figures are related (177 = 1% of 17712) but represent different
things: one is policy data, the other is a live computation result.

## Recommendation

This is a scanner fact-extraction/classification risk, not limited to this one
page — any tool page whose computed outputs numerically relate to a tracked
regulatory constant is at risk of the same false-positive pattern. Suggest:

1. Scanner should distinguish static/stated figures from interactive
   calculator outputs before matching against tracked facts (e.g. skip content
   inside calculator result panels, or require the exact expected value form,
   not an arithmetic derivative of it).
2. Re-check other DSH-scanned sites/tools for the same class of false positive
   before treating similar findings as confirmed content defects.

## Disposition

No fix required on qzenta/sikatrix. Findings re-ruled `confirmed` (scanner did
produce this output) with corrected notes explaining root cause — not left as
"site defect."

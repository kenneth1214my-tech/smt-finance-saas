// Singapore corporate income tax — computation logic only, no I/O. Rates/thresholds current as
// of YA2026 per IRAS (https://www.iras.gov.sg/taxes/corporate-income-tax/basics-of-corporate-income-tax/corporate-income-tax-rate-rebates-and-tax-exemption-schemes):
// - Flat rate: 17% of chargeable income.
// - Partial Tax Exemption (PTE): 75% exempt on the first S$10,000 of chargeable income, 50%
//   exempt on the next S$190,000 (max combined exemption S$102,500 on the first S$200,000).
// - CIT Rebate: a Budget-announced, year-specific rebate on tax payable (YA2026: 50% capped at
//   S$40,000) — this changes every year, so it's a per-row input (CorporateTaxProvision.rebatePct/
//   rebateCap), never a hardcoded constant here.
//
// chargeableIncome is a MANAGEMENT ESTIMATE (defaults to accounting net profit before tax) — real
// chargeable income requires tax adjustments (add back non-deductible expenses, deduct
// non-taxable income, substitute capital allowances for accounting depreciation) this system has
// no data to perform. Every computed figure here must be labelled as an estimate in the UI.

const PTE_FIRST_TIER_CAP = 10_000;
const PTE_FIRST_TIER_EXEMPT_PCT = 0.75;
const PTE_SECOND_TIER_CAP = 190_000; // on top of the first tier, i.e. up to $200,000 combined
const PTE_SECOND_TIER_EXEMPT_PCT = 0.5;

export interface CorporateTaxComputation {
  chargeableIncome: number;
  exemptAmount: number;
  taxableAfterExemption: number;
  grossTax: number;
  rebateAmount: number;
  netTaxPayable: number;
  effectiveRatePct: number; // netTaxPayable / chargeableIncome, 0 when chargeableIncome <= 0
}

export function computeCorporateTax(chargeableIncomeInput: number, taxRatePct: number, rebatePct: number, rebateCap: number): CorporateTaxComputation {
  // A loss year has nothing to tax and nothing to exempt — avoid a negative "exemption" reading
  // as a rebate.
  const chargeableIncome = Math.max(0, chargeableIncomeInput);

  const firstTier = Math.min(chargeableIncome, PTE_FIRST_TIER_CAP);
  const secondTier = Math.min(Math.max(0, chargeableIncome - PTE_FIRST_TIER_CAP), PTE_SECOND_TIER_CAP);
  const exemptAmount = firstTier * PTE_FIRST_TIER_EXEMPT_PCT + secondTier * PTE_SECOND_TIER_EXEMPT_PCT;

  const taxableAfterExemption = chargeableIncome - exemptAmount;
  const grossTax = taxableAfterExemption * (taxRatePct / 100);
  const rebateAmount = Math.min(grossTax * (rebatePct / 100), rebateCap);
  const netTaxPayable = Math.max(0, grossTax - rebateAmount);
  const effectiveRatePct = chargeableIncomeInput > 0 ? (netTaxPayable / chargeableIncomeInput) * 100 : 0;

  return { chargeableIncome: chargeableIncomeInput, exemptAmount, taxableAfterExemption, grossTax, rebateAmount, netTaxPayable, effectiveRatePct };
}

export interface GstQuarter {
  periodLabel: string;
  quarterStart: Date;
  quarterEnd: Date;
  dueDate: Date;
}

// Singapore's default GST filing cycle is quarterly, due on the last day of the month following
// the quarter's end (e.g. Q1 Jan-Mar due 30 Apr). Some businesses file monthly/half-yearly
// instead (not modelled here) — this only drives an auto-created DRAFT TaxFiling row, which stays
// fully editable/deletable like any other filing, so a wrong cadence for a given entity is a
// one-click fix, not a silent bad number.
export function gstQuarterFor(year: number, quarterNum: 1 | 2 | 3 | 4): GstQuarter {
  const q = quarterNum - 1;
  const quarterStart = new Date(year, q * 3, 1);
  const quarterEnd = new Date(year, q * 3 + 3, 0); // day 0 of the month after the quarter = its last day
  const dueDate = new Date(year, q * 3 + 4, 0); // one month later again
  return { periodLabel: `${year} Q${quarterNum}`, quarterStart, quarterEnd, dueDate };
}

export function currentGstQuarter(now: Date = new Date()): GstQuarter {
  const quarterNum = (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
  return gstQuarterFor(now.getFullYear(), quarterNum);
}

// Recovers a quarter's date range from a TaxFiling.periodLabel written in the "YYYY QN" format
// currentGstQuarter produces — used to know which date range to pull Xero transactions for when
// estimating a filing's tax figures after the fact. Returns null for a custom/manually-typed
// period label (e.g. a half-yearly or monthly filer), since there's nothing safe to assume then.
export function parseGstPeriodLabel(periodLabel: string): GstQuarter | null {
  const m = /^(\d{4})\s+Q([1-4])$/.exec(periodLabel.trim());
  if (!m) return null;
  return gstQuarterFor(Number(m[1]), Number(m[2]) as 1 | 2 | 3 | 4);
}

export type TaxFilingStatusComputed = "UPCOMING" | "FILED" | "OVERDUE" | "PAID";

// A filing's stored `status` is the source of truth once it's FILED or PAID (a human action, not
// derivable from dates) — this only ever promotes an UPCOMING row to OVERDUE based on the clock,
// never overrides a status someone has actually set.
export function effectiveFilingStatus(status: TaxFilingStatusComputed, dueDate: Date, now: Date = new Date()): TaxFilingStatusComputed {
  if (status === "UPCOMING" && dueDate < now) return "OVERDUE";
  return status;
}

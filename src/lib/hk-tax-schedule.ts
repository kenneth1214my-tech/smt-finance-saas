import { computeHkProfitsTax, type HkProfitsTaxComputation } from "@/lib/jurisdiction";

// Hong Kong profits tax computation schedule (the "pro forma" behind the Profits Tax Return): accounting profit,
// adjusted to ASSESSABLE profits, less losses brought forward, then taxed at the two-tiered rates.
//
//   accounting profit before tax
//   + add-backs   (accounting depreciation — derived automatically — plus non-deductible items, provisions, other)
//   − deductions  (offshore profits, capital profits, exempt income, depreciation allowances, other)
//   = assessable profits before losses
//   − losses brought forward utilised   (a loss for the year is carried forward until fully absorbed)
//   = assessable profits
//
// What the authorities say (IRD): profits tax is charged only on profits sourced in Hong Kong — offshore profits and
// capital profits are outside it, and offshore / capital LOSSES cannot be set off; plant and machinery get an initial
// allowance (60%) plus annual allowances (10% / 20% / 30% on the pooled reducing value) in place of accounting
// depreciation; a loss is carried forward and set off against later profits until fully absorbed.
// The system cannot know which items are non-deductible, offshore or allowance-eligible, so those are entered per
// provision as adjustments; only accounting depreciation is picked up automatically (derived from the fixed-asset movement).
//
// Pure — no I/O.

export interface HkAdjustmentCategory {
  key: string;
  sign: 1 | -1; // +1 increases assessable profits (add-back), −1 decreases it (deduction)
  labelEn: string;
  labelZh: string;
}

export const HK_ADJUSTMENT_CATEGORIES: HkAdjustmentCategory[] = [
  { key: "NON_DEDUCTIBLE", sign: 1, labelEn: "Add back: non-deductible expenses (capital items, private / domestic, etc.)", labelZh: "加回：不可扣减开支（资本性支出、私人/家庭开支等）" },
  { key: "PROVISIONS", sign: 1, labelEn: "Add back: provisions and impairments not yet allowable", labelZh: "加回：尚不可扣减的准备/减值" },
  { key: "OTHER_ADD", sign: 1, labelEn: "Add back: other", labelZh: "加回：其他" },
  { key: "OFFSHORE", sign: -1, labelEn: "Deduct: profits sourced outside Hong Kong (territorial basis)", labelZh: "扣除：来源于香港以外的利润（地域来源原则）" },
  { key: "CAPITAL_GAIN", sign: -1, labelEn: "Deduct: capital profits / gains (not chargeable)", labelZh: "扣除：资本性利润/收益（不征税）" },
  { key: "EXEMPT_INCOME", sign: -1, labelEn: "Deduct: exempt or non-chargeable income", labelZh: "扣除：豁免/不征税收入" },
  { key: "DEPRECIATION_ALLOWANCE", sign: -1, labelEn: "Deduct: depreciation allowances (initial 60% + annual 10/20/30% on pooled plant & machinery; building allowances)", labelZh: "扣除：折旧免税额（机器及设备首年 60% + 每年 10%/20%/30% 按池结余递减；楼宇免税额）" },
  { key: "OTHER_DEDUCT", sign: -1, labelEn: "Deduct: other", labelZh: "扣除：其他" },
];
const CATEGORY_BY_KEY = new Map(HK_ADJUSTMENT_CATEGORIES.map((c) => [c.key, c]));

export const signedAdjustment = (category: string, amount: number): number => (CATEGORY_BY_KEY.get(category)?.sign ?? 1) * Math.abs(amount);

export interface HkScheduleInput {
  id: string; // provision id
  entityKey: string; // "HQ" or subsidiary id — losses are tracked per legal entity
  year: number; // financial year
  accountingProfit: number;
  autoDepreciation: number | null; // derived from the fixed-asset movement; null when not derivable
  adjustments: { category: string; amount: number }[];
  lossesBroughtForward: number; // manual opening losses (e.g. before this system), added to what carries forward from earlier rows
  standardRatePct: number;
  lowerRateElected: boolean;
  rebatePct: number;
  rebateCap: number;
}

export interface HkScheduleRow {
  id: string;
  accountingProfit: number;
  autoDepreciation: number;
  addBacks: number; // all add-backs incl. depreciation
  deductions: number; // all deductions (positive number)
  adjustmentsNet: number; // addBacks − deductions
  byCategory: { key: string; amount: number }[]; // positive amounts as entered
  assessableBeforeLosses: number;
  lossesOpening: number;
  lossesUtilised: number;
  lossesClosing: number;
  assessableProfits: number; // taxed
  tax: HkProfitsTaxComputation;
}

const r2 = (n: number) => Math.round(n * 100) / 100 + 0;

export function computeHkSchedule(inputs: HkScheduleInput[]): Map<string, HkScheduleRow> {
  const out = new Map<string, HkScheduleRow>();
  const byEntity = new Map<string, HkScheduleInput[]>();
  for (const i of inputs) byEntity.set(i.entityKey, [...(byEntity.get(i.entityKey) ?? []), i]);

  for (const rows of byEntity.values()) {
    rows.sort((a, b) => a.year - b.year);
    let pool = 0; // losses carried forward from earlier years
    for (const r of rows) {
      const dep = r.autoDepreciation ?? 0;
      let addBacks = dep;
      let deductions = 0;
      const catTotals = new Map<string, number>();
      for (const a of r.adjustments) {
        const amt = Math.abs(a.amount);
        catTotals.set(a.category, (catTotals.get(a.category) ?? 0) + amt);
        if (signedAdjustment(a.category, 1) > 0) addBacks += amt;
        else deductions += amt;
      }
      const assessableBeforeLosses = r.accountingProfit + addBacks - deductions;
      const lossesOpening = pool + Math.max(0, r.lossesBroughtForward);
      let lossesUtilised = 0;
      let lossesClosing = lossesOpening;
      if (assessableBeforeLosses < 0) {
        lossesClosing = lossesOpening - assessableBeforeLosses; // this year's loss joins the pool
      } else {
        lossesUtilised = Math.min(lossesOpening, assessableBeforeLosses);
        lossesClosing = lossesOpening - lossesUtilised;
      }
      pool = lossesClosing;
      const assessableProfits = Math.max(0, assessableBeforeLosses - lossesUtilised);
      out.set(r.id, {
        id: r.id,
        accountingProfit: r2(r.accountingProfit),
        autoDepreciation: r2(dep),
        addBacks: r2(addBacks),
        deductions: r2(deductions),
        adjustmentsNet: r2(addBacks - deductions),
        byCategory: [...catTotals.entries()].map(([key, amount]) => ({ key, amount: r2(amount) })),
        assessableBeforeLosses: r2(assessableBeforeLosses),
        lossesOpening: r2(lossesOpening),
        lossesUtilised: r2(lossesUtilised),
        lossesClosing: r2(lossesClosing),
        assessableProfits: r2(assessableProfits),
        tax: computeHkProfitsTax(assessableProfits, r.standardRatePct, r.lowerRateElected, r.rebatePct, r.rebateCap),
      });
    }
  }
  return out;
}

import "server-only";
import { db } from "@/lib/db";
import { localizedName } from "@/lib/localize";
import type { Locale } from "@/lib/i18n/dictionaries";

// Line-by-line workings behind the Treasury KPIs, so every figure can be re-performed by hand.
// The derived cash flow only STORES each month's three totals, but every component is recoverable
// from data we already keep: net profit (MonthlyFinancial) and the stored month-end balance sheets
// (BalanceSheetMonthly). Depreciation is the one hidden term: investing = −(Δ fixed assets + depreciation),
// so depreciation = −investing − Δ fixed assets. Each section ends with a tie-out against the stored total.

export interface BreakdownRow {
  label: string;
  hint?: string;
  values: (number | null)[];
  kind?: "item" | "total" | "muted" | "check";
}
export interface BreakdownSection {
  id: string;
  title: string;
  result: number | null;
  formula: string;
  cols: string[];
  rows: BreakdownRow[];
  notes?: string[];
}

const num = (v: unknown) => Number(v ?? 0);
const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
const sum = (xs: (number | null)[]) => r2(xs.reduce<number>((a, x) => a + (x ?? 0), 0));

type Bs = { cash: number; loans: number; clearing: number; opAssets: number; fixedAssets: number; finAssets: number; opLiabilities: number; finLiabilities: number; totalEquity: number };
const toBs = (r: { cash: unknown; loans: unknown; clearing: unknown; opAssets: unknown; fixedAssets: unknown; finAssets: unknown; opLiabilities: unknown; finLiabilities: unknown; totalEquity: unknown }): Bs => ({
  cash: num(r.cash), loans: num(r.loans), clearing: num(r.clearing), opAssets: num(r.opAssets), fixedAssets: num(r.fixedAssets),
  finAssets: num(r.finAssets), opLiabilities: num(r.opLiabilities), finLiabilities: num(r.finLiabilities), totalEquity: num(r.totalEquity),
});

interface EntityFlow {
  label: string;
  ocf: number; icf: number; fcf: number;
  // null when no stored balance sheet covers the period (totals are still known)
  detail: null | {
    np: number; dep: number; dOpAssets: number; dOpLiab: number; dClearing: number; ocfCalc: number;
    dFixed: number; additions: number; icfCalc: number;
    borrowed: number; leaseInterco: number; finAssets: number; equityOther: number; fcfCalc: number;
    dCash: number; openLabel: string; closeLabel: string;
  };
  monthsLabel: string;
}

export async function buildFlowSections(args: {
  organizationId: string;
  year: number;
  fromMonth: number;
  toMonth: number;
  subsidiaryFilter: Record<string, unknown>;
  locale: Locale;
  isZh: boolean;
}): Promise<BreakdownSection[]> {
  const { organizationId, year, fromMonth, toMonth, subsidiaryFilter, locale, isZh } = args;
  const t = (zh: string, en: string) => (isZh ? zh : en);

  const [cfRows, bsRows, plRows] = await Promise.all([
    db.cashFlowMonthly.findMany({ where: { organizationId, year, month: { gte: fromMonth, lte: toMonth }, ...subsidiaryFilter }, include: { subsidiary: true } }),
    db.balanceSheetMonthly.findMany({ where: { organizationId, year: { in: [year - 1, year] }, ...subsidiaryFilter } }),
    db.monthlyFinancial.findMany({ where: { organizationId, year, month: { gte: fromMonth, lte: toMonth }, ...subsidiaryFilter } }),
  ]);
  if (cfRows.length === 0) return [];

  const bsKey = (sub: string | null, y: number, m: number) => `${sub ?? "HQ"}|${y}-${m}`;
  const bsMap = new Map(bsRows.map((r) => [bsKey(r.subsidiaryId, r.year, r.month), toBs(r)]));

  const entityIds = [...new Set(cfRows.map((r) => r.subsidiaryId))];
  const flows: EntityFlow[] = entityIds.map((id) => {
    const rows = cfRows.filter((r) => r.subsidiaryId === id);
    const months = rows.map((r) => r.month);
    const f = Math.min(...months);
    const l = Math.max(...months);
    const label = rows[0].subsidiary ? localizedName(rows[0].subsidiary, locale) : t("集团总部", "Group HQ");
    const ocf = sum(rows.map((r) => num(r.ocf)));
    const icf = sum(rows.map((r) => num(r.icf)));
    const fcf = sum(rows.map((r) => num(r.fcf)));
    const open = f === 1 ? bsMap.get(bsKey(id, year - 1, 12)) : bsMap.get(bsKey(id, year, f - 1));
    const close = bsMap.get(bsKey(id, year, l));
    const monthsLabel = f === l ? `${year}-${String(f).padStart(2, "0")}` : `${year}-${String(f).padStart(2, "0")} → ${String(l).padStart(2, "0")}`;
    if (!open || !close) return { label, ocf, icf, fcf, detail: null, monthsLabel };
    const np = sum(plRows.filter((p) => p.subsidiaryId === id && months.includes(p.month)).map((p) => num(p.netProfit)));
    const d = (k: keyof Bs) => r2(close[k] - open[k]);
    const dFixed = d("fixedAssets");
    const dep = r2(-icf - dFixed);
    const dOpAssets = d("opAssets");
    const dOpLiab = d("opLiabilities");
    const dClearing = d("clearing");
    const ocfCalc = r2(np + dep - dOpAssets + dOpLiab - dClearing);
    const additions = r2(dFixed + dep);
    const borrowed = r2(-d("loans"));
    const leaseInterco = d("finLiabilities");
    const finAssets = r2(-d("finAssets"));
    const equityOther = r2(d("totalEquity") - np);
    return {
      label, ocf, icf, fcf, monthsLabel,
      detail: {
        np, dep, dOpAssets, dOpLiab, dClearing, ocfCalc, dFixed, additions, icfCalc: r2(-additions),
        borrowed, leaseInterco, finAssets, equityOther, fcfCalc: r2(borrowed + leaseInterco + finAssets + equityOther),
        dCash: d("cash"), openLabel: f === 1 ? `${year - 1}-12` : `${year}-${String(f - 1).padStart(2, "0")}`, closeLabel: `${year}-${String(l).padStart(2, "0")}`,
      },
    };
  });
  flows.sort((a, b) => (a.label === t("集团总部", "Group HQ") ? -1 : b.label === t("集团总部", "Group HQ") ? 1 : a.label.localeCompare(b.label)));

  const multi = flows.length > 1;
  const cols = multi ? [...flows.map((f) => f.label), t("合计", "Total")] : flows.map((f) => f.label);
  const withTotal = (vals: (number | null)[]) => (multi ? [...vals, sum(vals)] : vals);
  const pick = (fn: (f: EntityFlow) => number | null) => withTotal(flows.map(fn));
  const det = (fn: (d: NonNullable<EntityFlow["detail"]>) => number) => pick((f) => (f.detail ? fn(f.detail) + 0 : null));
  const anyMissing = flows.some((f) => !f.detail);
  const missingNote = anyMissing ? t("部分主体缺少所选期间两端的月末资产负债表存档，只能显示合计，无法拆分明细。", "Some entities have no stored month-end balance sheet at both ends of the period, so only their totals can be shown, not the components.") : null;
  const periodNote = t(`期间：${flows.map((f) => `${f.label} ${f.monthsLabel}`).join("；")}`, `Period: ${flows.map((f) => `${f.label} ${f.monthsLabel}`).join("; ")}`);
  const totalOf = (key: "ocf" | "icf" | "fcf") => sum(flows.map((f) => f[key]));

  const diffRow = (label: string, calc: (number | null)[], stored: (number | null)[]): BreakdownRow[] => {
    const diffs = calc.map((c, i) => (c === null || stored[i] === null ? null : r2(c - (stored[i] as number))));
    const hasDiff = diffs.some((x) => x !== null && Math.abs(x) > 1);
    return [
      { label: t("系统存档合计（对照）", "Stored total (for comparison)"), values: stored, kind: "check" },
      ...(hasDiff ? [{ label: t("差异（需核查）", "Difference — needs review"), hint: label, values: diffs, kind: "check" as const }] : []),
    ];
  };

  const operating: BreakdownSection = {
    id: "ocf",
    title: t("经营现金流", "Operating cash flow"),
    result: totalOf("ocf"),
    formula: t("净利润 + 折旧（非现金）− 应收及其他经营资产增加 + 应付及其他经营负债增加 − 过渡账户增加", "Net profit + depreciation (non-cash) − increase in receivables & other operating assets + increase in payables & other operating liabilities − increase in clearing accounts"),
    cols,
    rows: [
      { label: t("净利润（利润表）", "Net profit (P&L)"), values: det((d) => d.np) },
      { label: t("＋ 折旧（非现金费用）", "+ Depreciation (non-cash)"), hint: t("= −投资现金流 − 固定资产净值变动", "= −investing cash flow − change in fixed assets"), values: det((d) => d.dep) },
      { label: t("－ 应收账款及其他经营资产增加", "− Increase in receivables & other operating assets"), values: det((d) => -d.dOpAssets) },
      { label: t("＋ 应付账款及其他经营负债增加", "+ Increase in payables & other operating liabilities"), values: det((d) => d.dOpLiab) },
      { label: t("－ 过渡/清算账户增加", "− Increase in clearing accounts"), values: det((d) => -d.dClearing) },
      { label: t("经营现金流（推算）", "Operating cash flow (calculated)"), values: det((d) => d.ocfCalc), kind: "total" },
      ...diffRow("OCF", det((d) => d.ocfCalc), pick((f) => f.ocf)),
    ],
    notes: [periodNote, ...(missingNote ? [missingNote] : [])],
  };

  const investing: BreakdownSection = {
    id: "icf",
    title: t("投资现金流净额", "Net investing cash flow"),
    result: totalOf("icf"),
    formula: t("−（固定资产净值变动 + 本期折旧）＝ 固定资产净购置支出", "−(change in net fixed assets + depreciation for the period) = cash spent on fixed assets (net)"),
    cols,
    rows: [
      { label: t("固定资产净值变动（期末 − 期初）", "Change in net fixed assets (closing − opening)"), values: det((d) => d.dFixed) },
      { label: t("＋ 本期折旧", "+ Depreciation for the period"), values: det((d) => d.dep) },
      { label: t("＝ 固定资产净增加（购置）", "= Fixed-asset additions"), values: det((d) => d.additions), kind: "total" },
      { label: t("投资现金流 ＝ −购置", "Investing cash flow = −additions"), values: det((d) => d.icfCalc), kind: "total" },
      ...diffRow("ICF", det((d) => d.icfCalc), pick((f) => f.icf)),
    ],
    notes: [periodNote, ...(missingNote ? [missingNote] : [])],
  };

  const financing: BreakdownSection = {
    id: "fcf",
    title: t("筹资现金流净额", "Net financing cash flow"),
    result: totalOf("fcf"),
    formula: t("银行借款净增加 + 租赁及集团内部负债变动 − 集团内部/金融资产增加 + 权益变动（不含净利润）", "Net bank borrowings drawn + change in lease & inter-company liabilities − increase in inter-company/financial assets + equity movement (excluding net profit)"),
    cols,
    rows: [
      { label: t("银行借款净增加（还款为负）", "Net bank borrowings drawn / (repaid)"), hint: t("贷款账户余额为负数，更负＝借款增加", "Loan accounts carry negative balances; more negative = more debt"), values: det((d) => d.borrowed) },
      { label: t("＋ 租赁及集团内部负债变动", "+ Change in lease & inter-company liabilities"), values: det((d) => d.leaseInterco) },
      { label: t("－ 集团内部/金融资产增加", "− Increase in inter-company / financial assets"), values: det((d) => d.finAssets) },
      { label: t("＋ 权益变动（不含净利润：注资、分红等）", "+ Equity movement excl. net profit (contributions, dividends…)"), values: det((d) => d.equityOther) },
      { label: t("筹资现金流（推算）", "Financing cash flow (calculated)"), values: det((d) => d.fcfCalc), kind: "total" },
      ...diffRow("FCF", det((d) => d.fcfCalc), pick((f) => f.fcf)),
      { label: t("核对：经营 + 投资 + 筹资", "Check: operating + investing + financing"), values: pick((f) => r2(f.ocf + f.icf + f.fcf)), kind: "check" },
      { label: t("核对：银行现金实际变动（期末 − 期初）", "Check: actual change in bank cash (closing − opening)"), values: det((d) => d.dCash), kind: "check" },
    ],
    notes: [periodNote, t("三项合计恒等于银行现金的实际变动（资产负债表恒等式）。", "The three always add up to the actual change in bank cash (balance-sheet identity)."), ...(missingNote ? [missingNote] : [])],
  };

  return [operating, investing, financing];
}

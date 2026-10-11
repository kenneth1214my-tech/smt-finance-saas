import type { BreakdownRow, BreakdownSection } from "@/lib/treasury-breakdown";

// Pure workings for the Overview's P&L KPIs (revenue, gross margin, operating profit, net profit) —
// no I/O, built from the same monthly rows the tiles are summed from, so every line re-adds to the tile.

export interface PnlInputRow {
  subsidiaryId: string | null;
  month: number;
  revenue: unknown;
  opCost: unknown;
  sellExp: unknown;
  adminExp: unknown;
  rndExp: unknown;
  financeExp: unknown;
  netProfit: unknown;
}

const num = (v: unknown) => Number(v ?? 0);
const r2 = (n: number) => Math.round(n * 100) / 100 + 0;

export function buildPnlSections(args: {
  entities: { id: string | null; label: string }[];
  rows: PnlInputRow[];
  fromMonth: number;
  toMonth: number;
  monthNames: string[];
  isZh: boolean;
}): BreakdownSection[] {
  const { entities, rows, fromMonth, toMonth, monthNames, isZh } = args;
  const t = (zh: string, en: string) => (isZh ? zh : en);
  const multi = entities.length > 1;
  const cols = multi ? [...entities.map((e) => e.label), t("合计", "Total")] : entities.map((e) => e.label);
  const withTotal = (vals: number[]) => (multi ? [...vals, r2(vals.reduce((a, x) => a + x, 0))] : vals);

  const sumField = (entityId: string | null, f: (r: PnlInputRow) => number, month?: number) =>
    r2(rows.filter((r) => r.subsidiaryId === entityId && (month === undefined || r.month === month)).reduce((a, r) => a + f(r), 0));
  const per = (f: (r: PnlInputRow) => number): number[] => withTotal(entities.map((e) => sumField(e.id, f)));

  const revenue = per((r) => num(r.revenue));
  const cost = per((r) => num(r.opCost));
  const sell = per((r) => num(r.sellExp));
  const admin = per((r) => num(r.adminExp));
  const rnd = per((r) => num(r.rndExp));
  const fin = per((r) => num(r.financeExp));
  const net = per((r) => num(r.netProfit));
  const gross = revenue.map((v, i) => r2(v - cost[i]));
  const opProfit = gross.map((g, i) => r2(g - sell[i] - admin[i] - rnd[i] - fin[i]));
  const lastIdx = revenue.length - 1;
  // Months that actually have data (a full-year view of the current year only has data up to the latest month).
  const dataMonths = rows.map((r) => r.month).filter((m) => m >= fromMonth && m <= toMonth);
  const firstM = dataMonths.length ? Math.min(...dataMonths) : fromMonth;
  const lastM = dataMonths.length ? Math.max(...dataMonths) : toMonth;
  const period = t(`期间：${monthNames[firstM - 1]} – ${monthNames[lastM - 1]}`, `Period: ${monthNames[firstM - 1]} – ${monthNames[lastM - 1]}`);

  const monthRows: BreakdownRow[] = [];
  for (let m = fromMonth; m <= toMonth; m++) {
    const vals = withTotal(entities.map((e) => sumField(e.id, (r) => num(r.revenue), m)));
    if (vals.every((v) => v === 0)) continue;
    monthRows.push({ label: monthNames[m - 1], values: vals });
  }

  const revenueSection: BreakdownSection = {
    id: "revenue",
    title: t("营业收入", "Revenue"),
    result: revenue[lastIdx],
    formula: t("所选期间内每个主体各月利润表营业收入（来自 Xero 同步的月度利润表）之和", "Sum of each entity's monthly P&L revenue over the selected period (from the monthly P&L synced from Xero)"),
    cols,
    rows: [...monthRows, { label: t("营业收入合计", "Total revenue"), values: revenue, kind: "total" }],
    notes: [period],
  };

  const pctOf = (g: number[], rev: number[]) => g.map((x, i) => (rev[i] > 0 ? (x / rev[i]) * 100 : null));
  const gmSection: BreakdownSection = {
    id: "gm",
    title: t("毛利率", "Gross margin"),
    result: revenue[lastIdx] > 0 ? (gross[lastIdx] / revenue[lastIdx]) * 100 : 0,
    resultFormat: "pct",
    formula: t("（营业收入 − 销售成本）÷ 营业收入；集团口径用各主体合计后再相除，而不是对各主体毛利率取平均", "(Revenue − cost of sales) ÷ revenue. The group figure divides the combined totals — it is not an average of the entities' own margins"),
    cols,
    rows: [
      { label: t("营业收入", "Revenue"), values: revenue },
      { label: t("－ 销售成本", "− Cost of sales"), values: cost.map((x) => -x) },
      { label: t("＝ 毛利润", "= Gross profit"), values: gross, kind: "total" },
      { label: t("毛利率", "Gross margin"), values: pctOf(gross, revenue), kind: "total", format: "pct" },
    ],
    notes: [period],
  };

  const opSection: BreakdownSection = {
    id: "op",
    title: t("营业利润", "Operating profit"),
    result: opProfit[lastIdx],
    formula: t("营业收入 − 销售成本 − 销售费用 − 管理费用 − 研发费用 − 财务费用", "Revenue − cost of sales − selling − administrative − R&D − finance expenses"),
    cols,
    rows: [
      { label: t("营业收入", "Revenue"), values: revenue },
      { label: t("－ 销售成本", "− Cost of sales"), values: cost.map((x) => -x) },
      { label: t("＝ 毛利润", "= Gross profit"), values: gross, kind: "total" },
      { label: t("－ 销售费用", "− Selling expenses"), values: sell.map((x) => -x) },
      { label: t("－ 管理费用", "− Administrative expenses"), values: admin.map((x) => -x) },
      { label: t("－ 研发费用", "− R&D expenses"), values: rnd.map((x) => -x) },
      { label: t("－ 财务费用", "− Finance expenses"), values: fin.map((x) => -x) },
      { label: t("＝ 营业利润", "= Operating profit"), values: opProfit, kind: "total" },
    ],
    notes: [t("费用按「设置 → 费用分类映射」把每个费用科目归入销售/管理/研发/财务四类。", "Expenses are grouped into selling / administrative / R&D / finance by the expense-category mapping in Settings."), period],
  };

  const npSection: BreakdownSection = {
    id: "np",
    title: t("净利润", "Net profit"),
    result: net[lastIdx],
    formula: t("利润表净利润（Xero 同步）；与营业利润的差额为其他收入/支出及税项", "Net profit as reported in the synced monthly P&L; the gap to operating profit is other income / expenses and tax"),
    cols,
    rows: [
      { label: t("营业利润（见上）", "Operating profit (above)"), values: opProfit },
      { label: t("＋ 其他收入、其他支出及税项（报告净利润与营业利润之差）", "+ Other income, other expenses & tax (reported net profit − operating profit)"), values: net.map((n, i) => r2(n - opProfit[i])) },
      { label: t("＝ 净利润（利润表）", "= Net profit (P&L)"), values: net, kind: "total" },
    ],
    notes: [period],
  };

  return [revenueSection, gmSection, opSection, npSection];
}

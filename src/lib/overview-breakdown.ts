import type { BreakdownRow, BreakdownSection } from "@/lib/treasury-breakdown";

// Pure workings for the P&L-based KPIs on the Overview, Business Analysis and Profit Analysis pages —
// no I/O, built from the same monthly rows the tiles are summed from, so every line re-adds to its tile.
// Sections (by id): revenue, cost, gm, expratio, rnd, perhead, opmargin, netmargin, op, np, roe.
// `perhead` needs `headcounts` and `roe` needs `equity` (both aligned with `entities`); they are omitted otherwise.

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
  /** Depreciation + amortisation for the month (optional: rows stored before it was captured read as 0). */
  depreciation?: unknown;
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
  headcounts?: number[];
  equity?: number[];
}): BreakdownSection[] {
  const { entities, rows, fromMonth, toMonth, monthNames, isZh, headcounts, equity } = args;
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
  const dna = per((r) => num(r.depreciation));
  const gross = revenue.map((v, i) => r2(v - cost[i]));
  const expenses = revenue.map((_, i) => r2(sell[i] + admin[i] + rnd[i] + fin[i]));
  const opProfit = gross.map((g, i) => r2(g - expenses[i]));
  const last = revenue.length - 1;
  const neg = (xs: number[]) => xs.map((x) => -x + 0);
  const ratio = (a: number[], b: number[]) => a.map((x, i) => (b[i] > 0 ? (x / b[i]) * 100 : null));
  const lastRatio = (a: number[], b: number[]) => ((b[last] ?? 0) > 0 ? ((a[last] ?? 0) / (b[last] ?? 0)) * 100 : 0);

  // Months that actually have data (a full-year view of the current year only has data up to the latest month).
  const dataMonths = rows.map((r) => r.month).filter((m) => m >= fromMonth && m <= toMonth);
  const firstM = dataMonths.length ? Math.min(...dataMonths) : fromMonth;
  const lastM = dataMonths.length ? Math.max(...dataMonths) : toMonth;
  const period = t(`期间：${monthNames[firstM - 1]} – ${monthNames[lastM - 1]}`, `Period: ${monthNames[firstM - 1]} – ${monthNames[lastM - 1]}`);

  const monthlyRows = (f: (r: PnlInputRow) => number): BreakdownRow[] => {
    const out: BreakdownRow[] = [];
    for (let m = fromMonth; m <= toMonth; m++) {
      const vals = withTotal(entities.map((e) => sumField(e.id, f, m)));
      if (vals.every((v) => v === 0)) continue;
      out.push({ label: monthNames[m - 1], values: vals });
    }
    return out;
  };
  const exp = (label: string, vals: number[]): BreakdownRow => ({ label, values: neg(vals) });

  const sections: BreakdownSection[] = [];

  sections.push({
    id: "revenue",
    title: t("营业收入", "Revenue"),
    result: (revenue[last] ?? 0),
    formula: t("所选期间内每个主体各月利润表营业收入（来自月度利润表）之和", "Sum of each entity's monthly P&L revenue over the selected period (from the monthly P&L)"),
    cols,
    rows: [...monthlyRows((r) => num(r.revenue)), { label: t("营业收入合计", "Total revenue"), values: revenue, kind: "total" }],
    notes: [period],
  });

  sections.push({
    id: "cost",
    title: t("营业成本", "Cost of sales"),
    result: (cost[last] ?? 0),
    formula: t("所选期间内每个主体各月利润表销售成本（毛利润线以上的成本）之和", "Sum of each entity's monthly cost of sales (costs above the gross-profit line) over the selected period"),
    cols,
    rows: [...monthlyRows((r) => num(r.opCost)), { label: t("营业成本合计", "Total cost of sales"), values: cost, kind: "total" }],
    notes: [period],
  });

  sections.push({
    id: "gm",
    title: t("毛利率", "Gross margin"),
    result: lastRatio(gross, revenue),
    resultFormat: "pct",
    formula: t("（营业收入 − 销售成本）÷ 营业收入；集团口径用各主体合计后再相除，而不是对各主体毛利率取平均", "(Revenue − cost of sales) ÷ revenue. The group figure divides the combined totals — it is not an average of the entities' own margins"),
    cols,
    rows: [
      { label: t("营业收入", "Revenue"), values: revenue },
      exp(t("－ 销售成本", "− Cost of sales"), cost),
      { label: t("＝ 毛利润", "= Gross profit"), values: gross, kind: "total" },
      { label: t("毛利率", "Gross margin"), values: ratio(gross, revenue), kind: "total", format: "pct" },
    ],
    notes: [period],
  });

  sections.push({
    id: "expratio",
    title: t("期间费用率", "Expense ratio"),
    result: lastRatio(expenses, revenue),
    resultFormat: "pct",
    formula: t("（销售费用 + 管理费用 + 研发费用 + 财务费用）÷ 营业收入", "(Selling + administrative + R&D + finance expenses) ÷ revenue"),
    cols,
    rows: [
      { label: t("销售费用", "Selling expenses"), values: sell },
      { label: t("＋ 管理费用", "+ Administrative expenses"), values: admin },
      { label: t("＋ 研发费用", "+ R&D expenses"), values: rnd },
      { label: t("＋ 财务费用", "+ Finance expenses"), values: fin },
      { label: t("＝ 期间费用合计", "= Total period expenses"), values: expenses, kind: "total" },
      { label: t("÷ 营业收入", "÷ Revenue"), values: revenue },
      { label: t("期间费用率", "Expense ratio"), values: ratio(expenses, revenue), kind: "total", format: "pct" },
    ],
    notes: [t("费用按「设置 → 费用分类映射」把每个费用科目归入销售/管理/研发/财务四类。", "Expenses are grouped into selling / administrative / R&D / finance by the expense-category mapping in Settings."), period],
  });

  sections.push({
    id: "rnd",
    title: t("研发投入强度", "R&D intensity"),
    result: lastRatio(rnd, revenue),
    resultFormat: "pct",
    formula: t("研发费用 ÷ 营业收入", "R&D expenses ÷ revenue"),
    cols,
    rows: [
      { label: t("研发费用", "R&D expenses"), values: rnd },
      { label: t("÷ 营业收入", "÷ Revenue"), values: revenue },
      { label: t("研发投入强度", "R&D intensity"), values: ratio(rnd, revenue), kind: "total", format: "pct" },
    ],
    notes: [t("研发费用来自费用分类映射中归为「研发」的科目；没有科目映射到研发时为 0。", "R&D expenses are the accounts mapped to \"R&D\" in the expense-category mapping; it is 0 when no account is mapped there."), period],
  });

  if (headcounts) {
    const hc = withTotal(headcounts);
    const perHead = revenue.map((v, i) => (hc[i] > 0 ? r2(v / hc[i]) : null));
    sections.push({
      id: "perhead",
      title: t("人均创收", "Revenue per employee"),
      result: (hc[last] ?? 0) > 0 ? (revenue[last] ?? 0) / (hc[last] ?? 0) : 0,
      formula: t("营业收入 ÷ 员工人数（取期间内最新一个月的人数；该月未填则用主体当前人数）", "Revenue ÷ headcount (latest month in the period; the entity's current headcount if that month has none)"),
      cols,
      rows: [
        { label: t("营业收入", "Revenue"), values: revenue },
        { label: t("÷ 员工人数", "÷ Headcount"), values: hc, format: "count" },
        { label: t("人均创收", "Revenue per employee"), values: perHead, kind: "total" },
      ],
      notes: [t("人数为时点数，不能跨月相加；集团人数为各主体人数之和。", "Headcount is a point-in-time figure (not added across months); the group figure is the sum of the entities' headcounts."), period],
    });
  }

  sections.push({
    id: "opmargin",
    title: t("营业利润率", "Operating margin"),
    result: lastRatio(opProfit, revenue),
    resultFormat: "pct",
    formula: t("营业利润 ÷ 营业收入；营业利润 = 毛利润 − 期间费用", "Operating profit ÷ revenue; operating profit = gross profit − period expenses"),
    cols,
    rows: [
      { label: t("毛利润", "Gross profit"), values: gross },
      exp(t("－ 期间费用（销售+管理+研发+财务）", "− Period expenses (selling + admin + R&D + finance)"), expenses),
      { label: t("＝ 营业利润", "= Operating profit"), values: opProfit, kind: "total" },
      { label: t("÷ 营业收入", "÷ Revenue"), values: revenue },
      { label: t("营业利润率", "Operating margin"), values: ratio(opProfit, revenue), kind: "total", format: "pct" },
    ],
    notes: [period],
  });

  sections.push({
    id: "netmargin",
    title: t("净利率", "Net margin"),
    result: lastRatio(net, revenue),
    resultFormat: "pct",
    formula: t("净利润 ÷ 营业收入", "Net profit ÷ revenue"),
    cols,
    rows: [
      { label: t("净利润（利润表）", "Net profit (P&L)"), values: net },
      { label: t("÷ 营业收入", "÷ Revenue"), values: revenue },
      { label: t("净利率", "Net margin"), values: ratio(net, revenue), kind: "total", format: "pct" },
    ],
    notes: [period],
  });

  sections.push({
    id: "op",
    title: t("营业利润", "Operating profit"),
    result: (opProfit[last] ?? 0),
    formula: t("营业收入 − 销售成本 − 销售费用 − 管理费用 − 研发费用 − 财务费用", "Revenue − cost of sales − selling − administrative − R&D − finance expenses"),
    cols,
    rows: [
      { label: t("营业收入", "Revenue"), values: revenue },
      exp(t("－ 销售成本", "− Cost of sales"), cost),
      { label: t("＝ 毛利润", "= Gross profit"), values: gross, kind: "total" },
      exp(t("－ 销售费用", "− Selling expenses"), sell),
      exp(t("－ 管理费用", "− Administrative expenses"), admin),
      exp(t("－ 研发费用", "− R&D expenses"), rnd),
      exp(t("－ 财务费用", "− Finance expenses"), fin),
      { label: t("＝ 营业利润", "= Operating profit"), values: opProfit, kind: "total" },
    ],
    notes: [t("费用按「设置 → 费用分类映射」把每个费用科目归入销售/管理/研发/财务四类。", "Expenses are grouped into selling / administrative / R&D / finance by the expense-category mapping in Settings."), period],
  });

  // EBIT = earnings before interest and tax: net profit (the monthly P&L figure is before income tax) plus the finance expenses.
  const ebit = net.map((n, i) => r2(n + fin[i]));
  const ebitda = ebit.map((e, i) => r2(e + dna[i]));
  const ebitMargin = ratio(ebit, revenue);
  const ebitdaMargin = ratio(ebitda, revenue);
  const hasDna = dna.some((x, i) => i < entities.length && x !== 0);
  sections.push({
    id: "ebit",
    title: t("息税前利润 EBIT", "EBIT (earnings before interest & tax)"),
    result: ebit[last] ?? 0,
    formula: t("EBIT = 净利润 + 财务费用（利息等）；月度利润表的净利润为税前，不含所得税", "EBIT = net profit + finance expenses (interest etc.); the monthly P&L net profit is before income tax"),
    cols,
    rows: [
      { label: t("净利润（利润表，税前）", "Net profit (P&L, before tax)"), values: net },
      { label: t("＋ 财务费用（利息等）", "+ Finance expenses (interest etc.)"), values: fin },
      { label: t("＝ EBIT", "= EBIT"), values: ebit, kind: "total" },
      { label: t("EBIT 利润率（EBIT ÷ 营业收入）", "EBIT margin (EBIT ÷ revenue)"), values: ebitMargin, format: "pct" },
      { label: t("对照：营业利润（见上）", "Memo: operating profit (above)"), values: opProfit },
      { label: t("EBIT 与营业利润之差 = 其他收入/支出", "EBIT − operating profit = other income / expenses"), values: ebit.map((e, i) => r2(e - opProfit[i])) },
    ],
    notes: [
      t("EBIT 包含其他收入/支出，所以可能与营业利润不同；所得税未入账时二者口径一致，如账内已记所得税，EBIT 会被低估，需要加回。", "EBIT includes other income / expenses, so it can differ from operating profit. Income tax is not deducted here; if the ledger books income tax inside net profit, EBIT is understated by that amount."),
      t("利息收入若记在其他收入里，会留在 EBIT 中（系统只能识别财务费用）。", "Interest income, if booked as other income, stays inside EBIT (only finance expenses can be identified)."),
      period,
    ],
    explanation: {
      meaning: t("不受融资方式和税务安排影响的经营盈利能力：公司在付利息和所得税之前赚了多少。", "Operating profitability before financing and tax: what the business earned before paying interest and income tax."),
      interpretation: [
        t("适合比较资本结构不同的主体（有借款和没借款的主体可以直接比）。", "Useful for comparing entities with different capital structures — borrowers and non-borrowers become comparable."),
        t("EBIT 为正而净利润为负，说明亏损来自利息负担。", "EBIT positive while net profit is negative means the loss comes from interest costs."),
        t("EBIT 利润率 = EBIT ÷ 营业收入，看每 1 元收入留下多少经营盈利。", "EBIT margin = EBIT ÷ revenue — how much operating profit each 1 of sales leaves."),
      ],
      current: (ebit[last] ?? 0) === 0 ? undefined : t(`所选期间 EBIT 为 ${r2(ebit[last] ?? 0).toLocaleString("en-US")}${ebitMargin[last] !== null && ebitMargin[last] !== undefined ? `，EBIT 利润率 ${(ebitMargin[last] as number).toFixed(1)}%` : ""}。`, `EBIT for the period is ${r2(ebit[last] ?? 0).toLocaleString("en-US")}${ebitMargin[last] !== null && ebitMargin[last] !== undefined ? `, an EBIT margin of ${(ebitMargin[last] as number).toFixed(1)}%` : ""}.`),
    },
  });

  sections.push({
    id: "ebitda",
    title: t("息税折旧摊销前利润 EBITDA", "EBITDA (earnings before interest, tax, depreciation & amortisation)"),
    result: ebitda[last] ?? 0,
    formula: t("EBITDA = EBIT + 折旧 + 摊销", "EBITDA = EBIT + depreciation + amortisation"),
    cols,
    rows: [
      { label: t("EBIT（见上）", "EBIT (above)"), values: ebit },
      { label: t("＋ 折旧与摊销", "+ Depreciation & amortisation"), hint: t("按科目名称从月度利润表识别（含 depreciation / amortisation）", "Picked from the monthly P&L by account name (anything with depreciation / amortisation)"), values: dna },
      { label: t("＝ EBITDA", "= EBITDA"), values: ebitda, kind: "total" },
      { label: t("EBITDA 利润率（EBITDA ÷ 营业收入）", "EBITDA margin (EBITDA ÷ revenue)"), values: ebitdaMargin, format: "pct" },
    ],
    notes: [
      ...(hasDna ? [] : [t("尚未识别到折旧/摊销科目，因此 EBITDA 暂等于 EBIT：若账中有折旧或摊销，请执行一次「全部同步」（Xero）或重新导入利润表后再看。", "No depreciation or amortisation accounts have been picked up yet, so EBITDA equals EBIT for now. If the ledger has any, run \"Sync all\" (Xero) or re-import the profit and loss.")]),
      t("EBITDA 不是现金流：它没有扣除营运资金变动、资本支出和税款。", "EBITDA is not cash flow: it leaves out working-capital movements, capital expenditure and tax."),
      period,
    ],
    explanation: {
      meaning: t("把折旧和摊销这类不涉及现金的费用加回后的经营盈利，常用来衡量主营业务产生现金的能力，也方便与不同折旧政策的主体比较。", "Operating profit with the non-cash charges for depreciation and amortisation added back — a common measure of the cash-generating power of the core business, and a fairer comparison between entities with different asset bases."),
      interpretation: [
        t("EBITDA 高于 EBIT 的部分就是折旧摊销：固定资产越多（如自有校舍、设备），差距越大。", "The gap between EBITDA and EBIT is the depreciation and amortisation — larger for entities with more fixed assets (premises, equipment)."),
        t("EBITDA 为正而 EBIT 为负：主营业务能产生现金，但被折旧摊销吞掉了账面利润。", "EBITDA positive with EBIT negative: the core business generates cash but depreciation and amortisation eat the accounting profit."),
        t("EBITDA 常与借款一起看（如 债务 ÷ EBITDA），衡量偿债压力。", "EBITDA is often read next to borrowings (e.g. debt ÷ EBITDA) to judge repayment pressure."),
      ],
      current: (ebitda[last] ?? 0) === 0 ? undefined : t(`所选期间 EBITDA 为 ${r2(ebitda[last] ?? 0).toLocaleString("en-US")}（含折旧摊销 ${r2(dna[last] ?? 0).toLocaleString("en-US")}）。`, `EBITDA for the period is ${r2(ebitda[last] ?? 0).toLocaleString("en-US")} (including ${r2(dna[last] ?? 0).toLocaleString("en-US")} of depreciation and amortisation).`),
    },
  });

  sections.push({
    id: "np",
    title: t("净利润", "Net profit"),
    result: (net[last] ?? 0),
    formula: t("利润表净利润；与营业利润的差额为其他收入/支出及税项", "Net profit as reported in the monthly P&L; the gap to operating profit is other income / expenses and tax"),
    cols,
    rows: [
      { label: t("营业利润（见上）", "Operating profit (above)"), values: opProfit },
      { label: t("＋ 其他收入、其他支出及税项（报告净利润与营业利润之差）", "+ Other income, other expenses & tax (reported net profit − operating profit)"), values: net.map((n, i) => r2(n - opProfit[i])) },
      { label: t("＝ 净利润（利润表）", "= Net profit (P&L)"), values: net, kind: "total" },
    ],
    notes: [period],
  });

  if (equity) {
    // Average across entities that actually have equity on file — an entity with none is "no data", not 0%.
    const roes = entities.map((_, i) => (equity[i] > 0 ? (net[i] / equity[i]) * 100 : null));
    const known = roes.filter((x): x is number => x !== null);
    const avg = known.length ? known.reduce((a, x) => a + x, 0) / known.length : 0;
    sections.push({
      id: "roe",
      title: t("平均 ROE", "Average ROE"),
      result: avg,
      resultFormat: "pct",
      formula: t("各主体 ROE = 净利润 ÷ 股东权益；平均 ROE = 有权益数据的主体 ROE 的算术平均", "Each entity's ROE = net profit ÷ equity; average ROE = simple average over the entities that have equity on file"),
      cols: [...entities.map((e) => e.label), t("平均", "Average")],
      rows: [
        { label: t("净利润（所选期间）", "Net profit (selected period)"), values: [...net.slice(0, entities.length), null] },
        { label: t("÷ 股东权益", "÷ Equity"), values: [...equity.map((x) => (x > 0 ? x : null)), null] },
        { label: t("ROE", "ROE"), values: [...roes, known.length ? avg : null], kind: "total", format: "pct" },
      ],
      notes: [
        t("ROE 为所选期间的净利润比率，未折算为年化；单月数据会明显偏小。无权益数据的主体不计入平均。", "ROE is for the selected period only, not annualised — a single month will look small. Entities with no equity on file are left out of the average."),
        period,
      ],
    });
  }

  return sections;
}

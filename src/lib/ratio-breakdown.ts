import type { BreakdownSection } from "@/lib/treasury-breakdown";

// Pure workings + plain-language explanations for the Business Analysis ratios: labour cost productivity,
// current ratio, quick ratio, debt-to-equity, EPS, P/E and dividend yield. No I/O — the page loads the
// balance sheets, employment cost and share data and passes them in, so every ratio re-adds from its lines.

export interface RatioBs {
  cash: number;
  opAssets: number; // receivables, prepayments, deposits, stock (everything current that isn't cash)
  receivables: number; // part of opAssets
  inventory: number; // part of opAssets
  opLiabilities: number; // payables, accruals, GST, deferred income
  loans: number; // loan accounts, signed (negative = debt)
  loansCurrent: number; // part of loans due within a year (signed)
  finLiabilities: number; // leases and other financial liabilities
  finLiabCurrent: number; // part of finLiabilities due within a year
  totalLiabilities: number;
  totalEquity: number;
  detailed: boolean; // false → the current/quick split was not captured yet (needs a sync)
  asOf: string; // yyyy-mm of the stored month-end used
}
export interface RatioEntity {
  id: string | null;
  label: string;
  revenue: number;
  employmentCost: number;
  employmentComplete: boolean; // employment cost found for every month that has revenue
  bs: RatioBs | null;
}
export interface RatioValues {
  labour: number | null;
  current: number | null;
  quick: number | null;
  de: number | null;
  eps: number | null;
  pe: number | null;
  yield: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
const sum = (xs: (number | null)[]) => r2(xs.reduce<number>((a, x) => a + (x ?? 0), 0));
const div = (a: number | null, b: number | null) => (a === null || b === null || b <= 0 ? null : a / b);

export function buildRatioSections(args: {
  entities: RatioEntity[];
  investmentEliminated: number;
  periodNetProfit: number;
  ttmNetProfit: number;
  ttmMonths: number;
  ttmLabel: string;
  shares: number | null;
  price: number | null;
  dividendPerShare: number | null;
  baseCurrency: string;
  isZh: boolean;
  /** Replaces the default "latest stored month-end balance sheet" note (a platform without stored balance sheets words its own basis). */
  basisNote?: string;
  /** Replaces the default "fills in on the next Xero sync" hint for missing employment cost. */
  labourMissingNote?: string;
  /** Dividends paid by the reporting company in the last 12 months, read from the balance sheet's equity accounts (null = not captured yet). */
  dividendsTtm?: number | null;
  /** Share capital on the balance sheet — used only to suggest a share count. */
  shareCapital?: number | null;
}): { sections: BreakdownSection[]; values: RatioValues } {
  const { entities, investmentEliminated, periodNetProfit, ttmNetProfit, ttmMonths, ttmLabel, shares, price, dividendPerShare, baseCurrency, isZh, basisNote, labourMissingNote, dividendsTtm = null, shareCapital = null } = args;
  const t = (zh: string, en: string) => (isZh ? zh : en);
  const multi = entities.length > 1;
  const cols = multi ? [...entities.map((e) => e.label), t("集团", "Group")] : entities.map((e) => e.label);
  const withTotal = (vals: (number | null)[]) => (multi ? [...vals, vals.every((v) => v === null) ? null : sum(vals)] : vals);
  const x2 = (n: number) => n.toFixed(2);

  const withBs = entities.filter((e) => e.bs);
  const allDetailed = withBs.length > 0 && withBs.every((e) => e.bs!.detailed);
  const asOf = [...new Set(withBs.map((e) => e.bs!.asOf))].join(", ");
  const bsNote = basisNote ?? (withBs.length
    ? t(`资产负债表取所选期间内最近一个已存档的月末（${asOf}）。`, `Balance sheet: the latest stored month-end within the selected period (${asOf}).`)
    : t("所选期间内没有已存档的月末资产负债表。", "No month-end balance sheet is stored for the selected period."));
  const needSync = t("流动/速动比率需要「一年内到期」的借款与租赁明细，该明细在下一次 Xero 同步时记录 — 请到「设置 → 数据导入与ERP」点击「全部同步」。", "The current and quick ratios need the \"due within a year\" split of loans and leases, which is captured on the next Xero sync — click Sync all under Settings → Data Import & ERP.");

  const bsPick = (f: (b: RatioBs) => number, needDetail = false): (number | null)[] =>
    withTotal(entities.map((e) => (e.bs && (!needDetail || e.bs.detailed) ? r2(f(e.bs)) : null)));
  const ratio = (num: (number | null)[], den: (number | null)[]): (number | null)[] => num.map((n, i) => div(n, den[i]));

  // ---------- Labour cost productivity ----------
  const revenue = withTotal(entities.map((e) => r2(e.revenue)));
  const empCost = withTotal(entities.map((e) => r2(e.employmentCost)));
  const labourComplete = entities.filter((e) => e.revenue !== 0).every((e) => e.employmentComplete);
  const labourPerEntity = entities.map((e) => (e.employmentComplete && e.employmentCost > 0 ? e.revenue / e.employmentCost : null));
  const totalCost = entities.reduce((a, e) => a + e.employmentCost, 0);
  const totalRev = entities.reduce((a, e) => a + e.revenue, 0);
  const labourGroup = labourComplete && totalCost > 0 ? totalRev / totalCost : null;
  const labourVals = multi ? [...labourPerEntity, labourGroup] : labourPerEntity;
  const labour = labourGroup;

  // ---------- Current / quick ----------
  const cash = bsPick((b) => b.cash);
  const opAssets = bsPick((b) => b.opAssets);
  const receivables = bsPick((b) => b.receivables, true);
  const currentAssets = bsPick((b) => b.cash + b.opAssets);
  const quickAssets = bsPick((b) => b.cash + b.receivables, true);
  const opLiab = bsPick((b) => b.opLiabilities);
  const loansCur = bsPick((b) => -b.loansCurrent, true);
  const finCur = bsPick((b) => b.finLiabCurrent, true);
  const currentLiab = bsPick((b) => b.opLiabilities - b.loansCurrent + b.finLiabCurrent, true);
  const currentRatio = ratio(currentAssets, currentLiab);
  const quickRatio = ratio(quickAssets, currentLiab);
  const groupOf = (xs: (number | null)[]) => (multi ? xs[xs.length - 1] : xs[0]);
  const current = allDetailed ? groupOf(currentRatio) ?? null : null;
  const quick = allDetailed ? groupOf(quickRatio) ?? null : null;

  // ---------- Debt to equity ----------
  // In this chart of accounts the loans sit in the BANK section as negative balances, so Xero's own "Total
  // liabilities" leaves them out (they net against assets). Debt-to-equity must include them.
  const reportedLiab = bsPick((b) => b.totalLiabilities);
  const loanAccounts = bsPick((b) => -b.loans);
  const liabilities = bsPick((b) => b.totalLiabilities - b.loans);
  const equityRaw = entities.map((e) => (e.bs ? r2(e.bs.totalEquity) : null));
  const equity = multi ? [...equityRaw, r2(sum(equityRaw) - investmentEliminated)] : equityRaw;
  const deRatio = liabilities.map((l, i) => (l === null || equity[i] === null || (equity[i] as number) <= 0 ? null : l / (equity[i] as number)));
  const debt = bsPick((b) => -b.loans + b.finLiabilities);
  const debtRatio = debt.map((d, i) => div(d, equity[i]));
  const de = groupOf(deRatio) ?? null;
  const equityNegative = withBs.length > 0 && (groupOf(equity) ?? 0) <= 0;

  // ---------- Per share / valuation ----------
  const groupEquity = withBs.length ? (groupOf(equity) ?? null) : null;
  const eps = shares && shares > 0 ? periodNetProfit / shares : null;
  const ttmComplete = ttmMonths >= 12;
  const ttmEps = shares && shares > 0 && ttmComplete ? ttmNetProfit / shares : null;
  // Valuation: price × shares when both are entered; otherwise the BOOK VALUE of equity — the only valuation an
  // unlisted company's own books can give. On book value the share count cancels out of P/E and dividend yield,
  // so those two work without any manual input.
  const enteredValue = price !== null && price > 0 && shares && shares > 0 ? price * shares : null;
  const marketValue = enteredValue ?? (groupEquity !== null && groupEquity > 0 ? groupEquity : null);
  const valuedAtBook = enteredValue === null && marketValue !== null;
  const pe = marketValue !== null && ttmComplete && ttmNetProfit > 0 ? marketValue / ttmNetProfit : null;
  // Dividends paid in the last 12 months: an entered dividend per share overrides what is read from the balance sheet.
  const enteredDividends = dividendPerShare !== null && shares && shares > 0 ? dividendPerShare * shares : null;
  const dividendsTotal = enteredDividends ?? dividendsTtm;
  const yieldPct = marketValue !== null && dividendsTotal !== null ? (dividendsTotal / marketValue) * 100 : null;
  const payout = dividendsTotal !== null && ttmComplete && ttmNetProfit > 0 ? (dividendsTotal / ttmNetProfit) * 100 : null;
  const noShares = t("请先在「设置 → 集团设置 → 股份数据」录入已发行股数。", "Enter the shares outstanding under Settings → Group Settings → Share data first.");
  const shareCapitalHint =
    shareCapital !== null && shareCapital > 0
      ? t(`资产负债表上的股本为 ${r2(shareCapital)} — 若每股发行价为 1，则约 ${Math.round(shareCapital)} 股；可在「设置 → 集团设置 → 股份数据」一键带入。`, `Share capital on the balance sheet is ${r2(shareCapital)} — if each share was issued at 1 that is about ${Math.round(shareCapital)} shares; Settings → Group Settings → Share data can fill it in with one click.`)
      : null;

  const sections: BreakdownSection[] = [];

  sections.push({
    id: "labour",
    title: t("劳动成本生产率（收入 ÷ 用工成本）", "Labour cost productivity (revenue ÷ employment cost)"),
    result: labour,
    resultFormat: "x",
    formula: t("营业收入 ÷ 用工成本（工资、公积金 CPF、奖金、董事酬金等）", "Revenue ÷ employment cost (salaries, CPF, bonuses, director remuneration, etc.)"),
    cols,
    rows: [
      { label: t("营业收入", "Revenue"), values: revenue },
      { label: t("÷ 用工成本", "÷ Employment cost"), hint: t("按科目名称从月度利润表中识别（工资、CPF、奖金、董事酬金、员工福利等）", "Picked from the monthly P&L by account name (salaries, CPF, bonuses, director remuneration, staff benefits…)"), values: empCost },
      { label: t("劳动成本生产率", "Labour cost productivity"), values: labourVals, kind: "total", format: "x" },
    ],
    notes: [
      ...(labourComplete ? [] : [labourMissingNote ?? t("部分月份尚未识别到用工成本，因此不显示比率（否则会虚高）— 下一次 Xero 同步后补全，请点击「全部同步」。", "Employment cost has not been picked up for some months yet, so the ratio is not shown (it would be overstated) — it fills in on the next Xero sync; click Sync all.")]),
      t("用工成本取自利润表中名称含工资/薪酬/CPF/奖金/董事酬金/员工等字样的科目，不含销售佣金。", "Employment cost = P&L accounts whose names mention salary / wages / CPF / bonus / remuneration / staff etc.; sales commissions are not included."),
    ],
    explanation: {
      meaning: t("衡量每投入 1 元用工成本能带来多少收入，反映人力投入的产出效率。", "How much revenue each 1 spent on employment cost brings in — a measure of how productively the payroll is used."),
      interpretation: [
        t("越高越好：同样的人力成本创造更多收入。", "Higher is better: the same payroll generates more revenue."),
        t("低于 1x：收入连用工成本都覆盖不了；1x–1.5x：人力成本吞掉大部分收入；约 2x–4x 对服务/教育类机构较常见（经验值，不同行业差异很大）。", "Below 1x: sales don't even cover payroll; 1x–1.5x: staff cost absorbs most of the revenue; roughly 2x–4x is common for service / education businesses (a rule of thumb — it varies a lot by industry)."),
        t("更有意义的是与自身历史、以及与同行比较其趋势。", "The trend over time, and against similar businesses, matters more than any single number."),
      ],
      current:
        labour === null
          ? undefined
          : t(
              `每 1 元用工成本带来 ${x2(labour)} 元收入。${labour < 1 ? "收入低于用工成本，薪酬支出未被销售覆盖。" : labour < 1.5 ? "人力成本占收入比重很高，留给其他开支的空间很小。" : labour < 3 ? "处于服务/教育类机构的常见区间。" : "产出效率较高，收入明显高于用工成本。"}`,
              `Every 1 of employment cost brought in ${x2(labour)} of revenue. ${labour < 1 ? "Revenue is below payroll cost — salaries are not covered by sales." : labour < 1.5 ? "Staff cost takes most of the revenue, leaving little for other costs." : labour < 3 ? "A normal range for a service / education business." : "Productive — revenue is well above payroll cost."}`
            ),
    },
  });

  sections.push({
    id: "current",
    title: t("流动比率", "Current ratio"),
    result: current,
    resultFormat: "x",
    formula: t("流动资产 ÷ 流动负债", "Current assets ÷ current liabilities"),
    cols,
    rows: [
      { label: t("现金（银行）", "Cash (bank)"), values: cash },
      { label: t("＋ 应收账款及其他经营性流动资产", "+ Receivables & other operating current assets"), hint: t("应收账款、预付款、押金、存货", "Trade receivables, prepayments, deposits, stock"), values: opAssets },
      { label: t("＝ 流动资产", "= Current assets"), values: currentAssets, kind: "total" },
      { label: t("经营性负债（应付、预提、GST 等）", "Operating liabilities (payables, accruals, GST…)"), values: opLiab },
      { label: t("＋ 一年内到期的银行借款", "+ Bank loans due within a year"), values: loansCur },
      { label: t("＋ 一年内到期的租赁及其他金融负债", "+ Leases & other financial liabilities due within a year"), values: finCur },
      { label: t("＝ 流动负债", "= Current liabilities"), values: currentLiab, kind: "total" },
      { label: t("流动比率", "Current ratio"), values: allDetailed ? currentRatio : currentRatio.map(() => null), kind: "total", format: "x" },
    ],
    notes: [
      bsNote,
      t("流动资产 = 现金 + 经营性流动资产；固定资产、使用权资产、集团内部/金融类资产不计入。流动负债 = 经营性负债 + 一年内到期的借款与租赁；集团内部/董事往来款除非科目名称注明「流动」，否则视为非流动。", "Current assets = cash + operating current assets; fixed assets, right-of-use assets and inter-company / financial assets are excluded. Current liabilities = operating liabilities + loans and leases due within a year; inter-company / director balances count as non-current unless the account name says current."),
      t("集团数为各主体相加，未抵消集团内部往来。", "The group figure is the simple sum of the entities; inter-company balances are not eliminated."),
      ...(allDetailed || withBs.length === 0 ? [] : [needSync]),
    ],
    explanation: {
      meaning: t("衡量用一年内可变现的资产偿还一年内到期债务的能力，是最常用的短期偿债能力指标。", "Whether assets that turn into cash within a year can cover the debts that fall due within a year — the most common short-term solvency test."),
      interpretation: [
        t("低于 1x：流动资产不足以覆盖短期负债，存在流动性压力。", "Below 1x: current assets don't cover short-term obligations — liquidity is under pressure."),
        t("1x–1.5x：勉强覆盖，缓冲较薄；1.5x–3x：通常视为稳健。", "1x–1.5x: covered but with a thin cushion; 1.5x–3x: usually considered comfortable."),
        t("明显高于 3x：很安全，但也可能意味着现金或应收款占用过多、资金利用效率不高。", "Well above 3x: very safe, but it can also mean cash or receivables are sitting idle."),
        t("应收账款质量会影响解读：逾期很久的应收款不一定能变现。", "Receivable quality matters: long-overdue receivables may not turn into cash."),
      ],
      current:
        current === null
          ? undefined
          : t(
              `流动资产为流动负债的 ${x2(current)} 倍。${current < 1 ? "不足以覆盖短期债务，需要关注资金安排。" : current < 1.5 ? "可以覆盖，但缓冲较薄。" : current <= 3 ? "短期偿债能力稳健。" : "非常充裕，可考虑资金是否闲置。"}`,
              `Current assets are ${x2(current)}x current liabilities. ${current < 1 ? "That does not cover short-term debts — watch funding closely." : current < 1.5 ? "Covered, but with a thin cushion." : current <= 3 ? "Short-term solvency looks comfortable." : "Very comfortable — check whether cash is sitting idle."}`
            ),
    },
  });

  sections.push({
    id: "quick",
    title: t("速动比率", "Quick ratio"),
    result: quick,
    resultFormat: "x",
    formula: t("（现金 + 应收账款）÷ 流动负债", "(Cash + receivables) ÷ current liabilities"),
    cols,
    rows: [
      { label: t("现金（银行）", "Cash (bank)"), values: cash },
      { label: t("＋ 应收账款", "+ Trade receivables"), values: receivables },
      { label: t("＝ 速动资产", "= Quick assets"), values: quickAssets, kind: "total" },
      { label: t("÷ 流动负债", "÷ Current liabilities"), values: currentLiab },
      { label: t("速动比率", "Quick ratio"), values: allDetailed ? quickRatio : quickRatio.map(() => null), kind: "total", format: "x" },
    ],
    notes: [bsNote, t("速动资产只含现金与应收账款，不含预付款、押金、存货等变现较慢的资产。", "Quick assets are only cash and receivables — prepayments, deposits and stock, which turn to cash slowly, are left out."), ...(allDetailed || withBs.length === 0 ? [] : [needSync])],
    explanation: {
      meaning: t("比流动比率更严格：只看现金和应收账款能否覆盖一年内到期的债务，不依赖存货或预付款变现。", "A stricter version of the current ratio: only cash and receivables count, so it doesn't rely on stock or prepayments being turned into cash."),
      interpretation: [
        t("1x 以上：不用动用存货/预付款也能还清短期债务。", "1x or more: short-term debts can be paid without relying on stock or prepayments."),
        t("低于 1x：需要依靠后续收入或融资来偿还部分短期债务，不一定有风险（例如预收学费的机构负债多为预收款），但需要关注现金流。", "Below 1x: part of the short-term debt has to be met from future income or funding — not necessarily a problem (e.g. an institution with fees received in advance), but cash flow needs watching."),
        t("与流动比率差距大，说明流动资产里有较多预付款、押金等非现金类项目。", "A big gap to the current ratio means a lot of the current assets are prepayments, deposits and similar non-cash items."),
      ],
      current:
        quick === null
          ? undefined
          : t(
              `现金加应收账款为流动负债的 ${x2(quick)} 倍。${quick >= 1 ? "无需依赖存货/预付款即可覆盖短期债务。" : "尚不足以覆盖全部短期债务，需要后续收入或融资补足。"}`,
              `Cash plus receivables are ${x2(quick)}x current liabilities. ${quick >= 1 ? "Short-term debts are covered without relying on stock or prepayments." : "Not enough to cover all short-term debts — future income or funding must make up the rest."}`
            ),
    },
  });

  sections.push({
    id: "de",
    title: t("资产负债比（负债 ÷ 权益）", "Debt-to-equity ratio"),
    result: de,
    resultFormat: "x",
    formula: t("负债总额 ÷ 所有者权益总额", "Total liabilities ÷ total equity"),
    cols,
    rows: [
      { label: t("资产负债表所列负债", "Liabilities per the balance sheet"), values: reportedLiab },
      { label: t("＋ 以负数银行账户记录的借款", "+ Loans carried as negative bank accounts"), hint: t("Xero 把贷款放在「银行」栏，不在负债合计内", "Xero lists these under Bank, so they are not in its liabilities total"), values: loanAccounts },
      { label: t("＝ 负债总额", "= Total liabilities"), values: liabilities, kind: "total" },
      { label: t("所有者权益总额", "Total equity"), hint: multi ? t(`集团数 = 各主体之和 − 总部对子公司投资（${r2(investmentEliminated)}）`, `Group = sum of entities − HQ's investment in subsidiaries (${r2(investmentEliminated)})`) : undefined, values: equity },
      { label: t("负债 ÷ 权益", "Debt ÷ equity"), values: deRatio, kind: "total", format: "x" },
      { label: t("其中：借款、租赁及融资类往来", "Of which: loans, leases & financing balances"), values: debt, kind: "muted" },
      { label: t("借款、租赁及融资类往来 ÷ 权益", "Loans, leases & financing ÷ equity"), values: debtRatio, kind: "muted", format: "x" },
    ],
    notes: [bsNote, t("贷款在 Xero 中以负数记入「银行」栏而不是负债，因此这里加回，否则负债会被低估。权益为负时比率无意义（显示「—」）。集团负债为各主体之和，未抵消集团内部往来。", "Loans are recorded in Xero as negative balances under Bank rather than as liabilities, so they are added back here — otherwise liabilities would be understated. The ratio is not meaningful when equity is zero or negative (shown as \"—\"). Group liabilities are the simple sum of the entities; inter-company balances are not eliminated.")],
    explanation: {
      meaning: t("衡量公司资产中有多少依靠举债、有多少来自股东：每 1 元权益对应多少元负债。", "How much the business relies on borrowed money versus shareholders' money: liabilities for every 1 of equity."),
      interpretation: [
        t("低于 1x：偏保守，权益大于负债。", "Below 1x: conservative — equity exceeds liabilities."),
        t("1x–2x：适中，多数企业处于此区间。", "1x–2x: moderate, where many businesses sit."),
        t("高于 2x：杠杆较高，利率上升或收入下滑时压力较大。", "Above 2x: highly geared — more exposed if interest rates rise or revenue falls."),
        t("此处用「负债总额」（含银行借款，以及应付账款、预收款等经营性负债），所以会比只看借款的口径更高；下方灰色行给出仅含借款、租赁及融资类往来的口径。", "This uses total liabilities (bank loans plus payables, income received in advance and other operating liabilities), so it reads higher than a borrowings-only view; the grey rows give the loans, leases and financing-only version."),
      ],
      current:
        de === null
          ? equityNegative
            ? t("权益为零或为负（累计亏损超过股本），此比率无意义，需要重点关注偿债与再融资能力。", "Equity is zero or negative (accumulated losses exceed capital), so the ratio is not meaningful — solvency and refinancing need close attention.")
            : undefined
          : t(
              `每 1 元权益对应 ${x2(de)} 元负债。${de < 1 ? "偏保守。" : de <= 2 ? "处于适中水平。" : "杠杆较高。"}`,
              `Every 1 of equity carries ${x2(de)} of liabilities. ${de < 1 ? "Conservative." : de <= 2 ? "A moderate level." : "Highly geared."}`
            ),
    },
  });

  sections.push({
    id: "eps",
    title: t("每股收益（EPS）", "Earnings per share (EPS)"),
    result: eps,
    resultFormat: "pershare",
    formula: t("净利润 ÷ 已发行股数", "Net profit ÷ shares outstanding"),
    cols: [t("集团", "Group")],
    rows: [
      { label: t("净利润（所选期间）", "Net profit (selected period)"), values: [r2(periodNetProfit)] },
      { label: t("÷ 已发行股数", "÷ Shares outstanding"), values: [shares], format: "count" },
      { label: t("每股收益（所选期间）", "EPS (selected period)"), values: [eps], kind: "total", format: "pershare" },
      { label: t(`净利润（${ttmLabel}）`, `Net profit (${ttmLabel})`), values: [r2(ttmNetProfit)], kind: "muted" },
      { label: t("每股收益（近 12 个月）", "EPS (last 12 months)"), values: [ttmEps], kind: "muted", format: "pershare" },
    ],
    notes: [
      ...(shares ? [] : [noShares]),
      ...(shares || !shareCapitalHint ? [] : [shareCapitalHint]),
      t(`每股金额以 ${baseCurrency} 计。EPS 为所选期间（可能不足一年）的数值，未年化。`, `Per-share amounts are in ${baseCurrency}. EPS is for the selected period (which may be under a year) and is not annualised.`),
    ],
    explanation: {
      meaning: t("每一股普通股所对应的利润（或亏损），是衡量股东回报的基础指标。", "The profit (or loss) attributable to each ordinary share — the basic measure of what the business earns for its shareholders."),
      interpretation: [
        t("为正表示盈利，数字越大、逐期增长越好；为负表示每股亏损。", "Positive means profit — bigger and growing is better; negative means a loss per share."),
        t("不能脱离股数单独比较：增发股份会摊薄 EPS，回购会提高 EPS。", "Don't compare it without the share count: issuing new shares dilutes EPS, buying shares back raises it."),
        t("本系统按集团合并净利润 ÷ 母公司股数计算，假设没有少数股东权益。", "Calculated as group net profit ÷ the parent's shares, assuming there are no minority interests."),
        t("股数不在财务系统中，需在设置里录入一次（这是唯一必须手工提供的数据）。", "The share count is not in the accounting system, so it is entered once in Settings (the only figure that has to be supplied by hand)."),
      ],
      current:
        eps === null
          ? undefined
          : t(`所选期间每股${eps >= 0 ? "盈利" : "亏损"} ${Math.abs(eps).toFixed(4)} ${baseCurrency}。`, `${eps >= 0 ? "Profit" : "Loss"} per share for the selected period: ${Math.abs(eps).toFixed(4)} ${baseCurrency}.`),
    },
  });

  sections.push({
    id: "pe",
    title: t("市盈率（P/E）", "Price-to-earnings ratio (P/E)"),
    result: pe,
    resultFormat: "x",
    formula: t("市值 ÷ 近 12 个月净利润（= 每股价格 ÷ 每股收益）", "Market value ÷ net profit of the last 12 months (= price per share ÷ EPS)"),
    cols: [t("集团", "Group")],
    rows: [
      {
        label: valuedAtBook ? t("估值：账面权益（未录入价格，自动使用）", "Valuation: book equity (no price entered — used automatically)") : t("估值：每股价格 × 股数", "Valuation: price per share × shares"),
        values: [marketValue === null ? null : r2(marketValue)],
      },
      { label: t(`÷ 净利润（${ttmLabel}）`, `÷ Net profit (${ttmLabel})`), values: [ttmComplete ? r2(ttmNetProfit) : null] },
      { label: t("市盈率", "P/E ratio"), values: [pe], kind: "total", format: "x" },
    ],
    notes: [
      ...(valuedAtBook
        ? [t("非上市公司没有市场价格，因此自动以账面权益（净资产）作为估值，得到的是「账面市盈率」；如有最近一次融资/评估估值，请在「设置 → 股份数据」录入每股价格以覆盖。", "An unlisted company has no market price, so equity (net assets) at book value is used as the valuation automatically — a \"book P/E\". If you have a recent funding or valuation figure, enter the price per share in Settings → Share data to override it.")]
        : [t("使用你录入的每股价格 × 股数作为估值，因此市盈率是估算值。", "Uses the price per share × shares you entered as the valuation, so the P/E is an estimate.")]),
      ...(marketValue === null ? [t("暂无可用估值：没有权益数据，也没有录入价格与股数。", "No valuation available: there is no equity figure and no price and share count have been entered.")] : []),
      ...(!ttmComplete ? [t(`近 12 个月仅有 ${ttmMonths} 个月数据，不足以计算。`, `Only ${ttmMonths} months of history are available — not enough for a last-12-months figure.`)] : []),
      ...(ttmComplete && ttmNetProfit <= 0 ? [t("近 12 个月为亏损，市盈率无意义（n/m）。", "The last 12 months were loss-making, so P/E is not meaningful (n/m).")] : []),
    ],
    explanation: {
      meaning: t("投资者为每 1 元年度盈利愿意支付多少元；也可理解为「按当前盈利水平，多少年能收回投资」。", "How much an investor pays for each 1 of annual earnings — or, roughly, how many years of current profit it takes to earn the price back."),
      interpretation: [
        t("约 10x–20x 为常见区间（经验值，行业差异大）；明显偏高通常反映对增长的预期，偏低可能说明被低估，也可能说明盈利前景不佳。", "Roughly 10x–20x is a common range (a rule of thumb — industries differ); a much higher figure usually reflects expected growth, a much lower one can mean cheap or can mean poor prospects."),
        t("公司亏损时市盈率没有意义，显示 n/m。", "When the company makes a loss, P/E is not meaningful (n/m)."),
        t("使用近 12 个月盈利，避免单月波动影响。", "Uses last-12-months earnings so a single month doesn't swing it."),
        t("按账面权益估值时，这个数字其实是「净资产 ÷ 年利润」，反映需要几年利润才能抵得上净资产。", "Valued at book equity, the figure is really \"net assets ÷ annual profit\" — how many years of profit it takes to match the net assets."),
      ],
      current:
        pe === null
          ? ttmComplete && ttmNetProfit <= 0
            ? t("近 12 个月亏损，市盈率为 n/m（无意义）。", "Loss-making over the last 12 months — P/E is n/m (not meaningful).")
            : undefined
          : t(
              `按${valuedAtBook ? "账面权益" : "当前价格"}估值，需要约 ${x2(pe)} 年的盈利才能抵得上估值。${pe < 10 ? "偏低。" : pe <= 20 ? "处于常见区间。" : "偏高，隐含较高的增长预期。"}`,
              `On ${valuedAtBook ? "book equity" : "the entered price"} it would take about ${x2(pe)} years of current earnings to match the valuation. ${pe < 10 ? "On the low side." : pe <= 20 ? "In the common range." : "On the high side — it implies strong growth expectations."}`
            ),
    },
  });

  sections.push({
    id: "yield",
    title: t("股息率", "Dividend yield"),
    result: yieldPct,
    resultFormat: "pct",
    formula: t("近 12 个月已派股息 ÷ 市值 × 100%", "Dividends paid in the last 12 months ÷ market value × 100%"),
    cols: [t("集团", "Group")],
    rows: [
      { label: t("已派股息（近 12 个月）", "Dividends paid (last 12 months)"), hint: enteredDividends !== null ? t("按你录入的每股股息 × 股数", "From the dividend per share you entered × shares") : t("取自资产负债表中权益下的股息/分红科目的月度增加", "Read from the monthly increase in the dividend / distribution accounts under equity on the balance sheet"), values: [dividendsTotal === null ? null : r2(dividendsTotal)] },
      { label: valuedAtBook ? t("÷ 估值：账面权益", "÷ Valuation: book equity") : t("÷ 估值：每股价格 × 股数", "÷ Valuation: price per share × shares"), values: [marketValue === null ? null : r2(marketValue)] },
      { label: t("股息率", "Dividend yield"), values: [yieldPct], kind: "total", format: "pct" },
      { label: t("派息率（股息 ÷ 近 12 个月净利润）", "Payout ratio (dividends ÷ last-12-months net profit)"), values: [payout], kind: "muted", format: "pct" },
    ],
    notes: [
      ...(dividendsTotal === null ? [t("尚未取得股息数据：下一次 Xero 同步后会从资产负债表读取；也可在「设置 → 股份数据」录入每股股息与股数来覆盖。", "No dividend data yet: it is read from the balance sheet on the next Xero sync; you can also override it by entering the dividend per share and the share count in Settings → Share data.")] : []),
      ...(dividendsTotal === 0 ? [t("近 12 个月没有记录到股息（若股息直接记入留存收益而没有单独的权益科目，则无法识别）。", "No dividends were recorded in the last 12 months (a dividend booked straight to retained earnings, with no separate equity account, cannot be recognised).")] : []),
      ...(marketValue === null ? [t("暂无可用估值（没有权益数据，也没有录入价格与股数）。", "No valuation available (no equity figure, and no price and share count entered).")] : []),
    ],
    explanation: {
      meaning: t("按当前估值，每年以股息形式回报给股东的现金比例。", "The cash a shareholder receives each year as dividends, as a percentage of what the shares are worth."),
      interpretation: [
        t("约 2%–6% 较常见；0% 表示不派息（利润留存再投资）。", "Around 2%–6% is common; 0% means no dividend is paid (profit is kept and reinvested)."),
        t("过高要警惕：可能是估值偏低，或派息超出盈利、难以持续。", "Be careful with a very high figure: the valuation may be low, or the dividend may be more than earnings and hard to sustain."),
        t("结合派息率看：派息率超过 100% 说明派息大于盈利，靠动用留存收益或借款支付。", "Read it with the payout ratio: above 100% means the dividend is larger than earnings and is being paid out of reserves or borrowings."),
      ],
      current:
        yieldPct === null
          ? undefined
          : t(
              `按${valuedAtBook ? "账面权益" : "当前估值"}，股息回报率为 ${x2(yieldPct)}%。${yieldPct === 0 ? "近 12 个月没有派息。" : yieldPct < 2 ? "偏低。" : yieldPct <= 6 ? "处于常见区间。" : "偏高，需确认是否可持续。"}${payout !== null && payout > 100 ? " 派息率超过 100%，派息大于盈利。" : ""}`,
              `On ${valuedAtBook ? "book equity" : "the entered valuation"} the dividend return is ${x2(yieldPct)}%. ${yieldPct === 0 ? "No dividend was paid in the last 12 months." : yieldPct < 2 ? "On the low side." : yieldPct <= 6 ? "In the common range." : "On the high side — check it is sustainable."}${payout !== null && payout > 100 ? " The payout ratio is above 100% — the dividend exceeds earnings." : ""}`
            ),
    },
  });

  return { sections, values: { labour, current, quick, de, eps, pe, yield: yieldPct } };
}

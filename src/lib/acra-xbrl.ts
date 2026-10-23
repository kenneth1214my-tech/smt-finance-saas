// Singapore: the company's financial statements mapped onto the ACRA Taxonomy 2026 (v1.0) so they can be filed in XBRL
// through ACRA's BizFinx. Pure — the loader (acra-xbrl-data.ts) hands in the figures, this file decides which ACRA element
// each one is, checks that the statements add up, and writes the XBRL instance.
//
// Every element name below was checked against the published taxonomy package (sg-as / sg-dei, period type, debit/credit
// balance, and whether it sits in the Full and/or Simplified XBRL entry point). ACRA's taxonomy is closed — no company-
// specific concepts — so the mapping only uses elements that exist there.

export type AcraTemplate = "Full XBRL" | "Simplified XBRL";
export type AcraScope = "company" | "group";

export const ACRA_TAXONOMY_LABEL = "ACRA Taxonomy 2026 v1.0";
export const ACRA_TAXONOMY_VERSION: Record<AcraTemplate, string> = { "Full XBRL": "Full_XBRL_2026_v1.0", "Simplified XBRL": "Simplified_XBRL_2026_v1.0" };
export const ACRA_ENTRY_POINT: Record<AcraTemplate, string> = {
  "Full XBRL": "https://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sfrs-ent_2026-01-01.xsd",
  "Simplified XBRL": "https://www.bizfinx.gov.sg/taxonomy/2026-01-01/sg-sim-ent_2026-01-01.xsd",
};
const NS = {
  "sg-dei": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/elts/sg-dei",
  "sg-as": "http://www.bizfinx.gov.sg/taxonomy/2026-01-01/elts/sg-as",
};
/** ACRA: a "smaller company" has revenue AND total assets of at most S$500,000 (consolidated when it has subsidiaries). */
export const SMALLER_COMPANY_LIMIT = 500_000;

export interface PnlInput {
  revenue: number;
  costOfSales: number;
  sellExp: number;
  adminExp: number;
  rndExp: number;
  financeExp: number;
  employmentCost: number;
  netProfit: number; // before tax — the figure the Tax Center already treats as profit before tax
}
export interface BalanceInput {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  cash: number;
  clearing: number;
  loans: number; // negative = owed (loan accounts sit in the Bank section of the ledger)
  opAssets: number;
  fixedAssets: number;
  finAssets: number;
  opLiabilities: number;
  finLiabilities: number;
  receivables: number;
  inventory: number;
  loansCurrent: number; // negative like `loans`
  finLiabCurrent: number;
  shareCapital: number;
  detailed: boolean; // receivables / inventory / current splits were captured
  equityDetailed: boolean; // the share capital account was picked out of the equity section
  /** Only the three totals are known (a single current snapshot, no line detail): the lines below the totals stay blank. */
  totalsOnly?: boolean;
}
export interface CashFlowInput {
  ocf: number;
  icf: number;
  fcf: number;
}
export interface PeriodInput {
  pnl: PnlInput | null;
  bs: BalanceInput | null; // balance sheet at the period end
  cf: CashFlowInput | null;
}

export interface AcraBuildInput {
  entityName: string;
  uen: string | null;
  scope: AcraScope;
  year: number; // financial year, named by the calendar year it ends in
  fyeMonth: number;
  template?: AcraTemplate; // forced choice; otherwise ACRA's size test decides
  accountingFramework: "SFRS_I" | "SFRS_SE";
  isZh: boolean;
  current: PeriodInput;
  prior: PeriodInput;
  /** Extra checks from the loader (e.g. the balance sheet is a current snapshot rather than a year-end archive). */
  extraChecks?: AcraCheck[];
}

export type LineSection = "sfp" | "pl" | "cf";
export interface AcraLine {
  section: LineSection;
  element: string; // prefix:LocalName exactly as in the taxonomy
  label: string;
  period: "instant" | "duration";
  side: "debit" | "credit";
  kind: "item" | "subtotal";
  current: number | null;
  prior: number | null;
  source: string; // where the figure comes from in this platform
  fullOnly?: boolean; // only in the Full XBRL template
}
export interface AcraCheck {
  id: string;
  label: string;
  ok: boolean | null; // null = cannot be tested yet
  detail: string;
}
export interface AcraPack {
  taxonomy: string;
  template: AcraTemplate;
  templateReason: string;
  entityName: string;
  uen: string | null;
  scope: AcraScope;
  year: number;
  periodStart: string; // ISO dates
  periodEnd: string;
  priorStart: string;
  priorEnd: string;
  lines: AcraLine[];
  checks: AcraCheck[];
  todo: string[]; // parts of the filing that only the company / auditor can supply
  readyForInstance: boolean;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100 + 0;
const tt = (isZh: boolean) => (zh: string, en: string) => (isZh ? zh : en);
const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function acraPeriodDates(year: number, fyeMonth: number) {
  const endDay = daysIn(year, fyeMonth);
  const startIdx = year * 12 + (fyeMonth - 1) - 11;
  const start = iso(Math.floor(startIdx / 12), (startIdx % 12) + 1, 1);
  const end = iso(year, fyeMonth, endDay);
  const pEndDay = daysIn(year - 1, fyeMonth);
  const pStartIdx = (year - 1) * 12 + (fyeMonth - 1) - 11;
  return { start, end, priorStart: iso(Math.floor(pStartIdx / 12), (pStartIdx % 12) + 1, 1), priorEnd: iso(year - 1, fyeMonth, pEndDay) };
}

// ---------------------------------------------------------------------------------------------
// Statement of financial position — "current and non-current" presentation
// ---------------------------------------------------------------------------------------------
interface SfpValues {
  cash: number; recv: number; inv: number; otherCurNonFin: number; clearing: number; currentAssets: number;
  ppe: number; otherNcFin: number; nonCurrentAssets: number; assets: number;
  payables: number; curLoans: number; otherCurFin: number; currentLiabilities: number;
  ncLoans: number; otherNcFinLiab: number; nonCurrentLiabilities: number; liabilities: number;
  shareCapital: number; accumulated: number; equity: number;
  reportedAssets: number; reportedLiabilities: number; reportedEquity: number; detailed: boolean;
}
function sfpOf(b: BalanceInput | null): SfpValues | null {
  if (!b) return null;
  if (b.totalsOnly) {
    const blank = Number.NaN;
    return {
      cash: blank, recv: blank, inv: blank, otherCurNonFin: blank, clearing: blank, currentAssets: blank, ppe: blank, otherNcFin: blank, nonCurrentAssets: blank,
      assets: r2(b.totalAssets), payables: blank, curLoans: blank, otherCurFin: blank, currentLiabilities: blank, ncLoans: blank, otherNcFinLiab: blank,
      nonCurrentLiabilities: blank, liabilities: r2(b.totalLiabilities), shareCapital: blank, accumulated: blank, equity: r2(b.totalEquity),
      reportedAssets: r2(b.totalAssets), reportedLiabilities: r2(b.totalLiabilities), reportedEquity: r2(b.totalEquity), detailed: false,
    };
  }
  const loansOwed = Math.max(0, -b.loans);
  const curLoansRaw = Math.min(Math.max(0, -b.loansCurrent), loansOwed);
  const recv = b.detailed ? b.receivables : 0;
  const inv = b.detailed ? b.inventory : 0;
  const cash = r2(b.cash);
  const recvR = r2(recv);
  const invR = r2(inv);
  const otherCurNonFin = r2(b.opAssets - recv - inv);
  const clearing = r2(b.clearing);
  const currentAssets = r2(cash + recvR + invR + otherCurNonFin + clearing);
  const ppe = r2(b.fixedAssets);
  const otherNcFin = r2(b.finAssets);
  const nonCurrentAssets = r2(ppe + otherNcFin);
  const assets = r2(currentAssets + nonCurrentAssets);

  const payables = r2(b.opLiabilities);
  const curLoans = r2(curLoansRaw);
  const finCur = b.detailed ? Math.min(Math.max(0, b.finLiabCurrent), Math.max(0, b.finLiabilities)) : 0;
  const otherCurFin = r2(finCur);
  const currentLiabilities = r2(payables + curLoans + otherCurFin);
  const ncLoans = r2(loansOwed - curLoansRaw);
  const otherNcFinLiab = r2(b.finLiabilities - finCur);
  const nonCurrentLiabilities = r2(ncLoans + otherNcFinLiab);
  const liabilities = r2(currentLiabilities + nonCurrentLiabilities);

  const shareCapital = r2(b.shareCapital);
  const accumulated = r2(b.totalEquity - b.shareCapital);
  const equity = r2(shareCapital + accumulated);
  return {
    cash, recv: recvR, inv: invR, otherCurNonFin, clearing, currentAssets, ppe, otherNcFin, nonCurrentAssets, assets,
    payables, curLoans, otherCurFin, currentLiabilities, ncLoans, otherNcFinLiab, nonCurrentLiabilities, liabilities,
    shareCapital, accumulated, equity,
    // The ledger's own totals, with the loan accounts moved from the Bank section (where they net off assets) to liabilities
    reportedAssets: r2(b.totalAssets + loansOwed),
    reportedLiabilities: r2(b.totalLiabilities + loansOwed),
    reportedEquity: r2(b.totalEquity),
    detailed: b.detailed,
  };
}

// ---------------------------------------------------------------------------------------------
// Statement of profit or loss — "by nature of expense" (the only presentation in the Full template)
// ---------------------------------------------------------------------------------------------
interface PlValues {
  revenue: number; otherIncome: number; otherGainsLosses: number; employee: number; otherExpenses: number; financeCosts: number;
  pbt: number; tax: number; profit: number; reportedPbt: number;
}
function plOf(p: PnlInput | null): PlValues | null {
  if (!p) return null;
  const operatingExpenses = p.costOfSales + p.sellExp + p.adminExp + p.rndExp;
  const employee = Math.min(Math.max(0, p.employmentCost), Math.max(0, operatingExpenses));
  const otherExpenses = r2(operatingExpenses - employee);
  const financeCosts = r2(p.financeExp);
  const revenue = r2(p.revenue);
  // Whatever the ledger's profit contains beyond (revenue − expenses) is non-operating income or a gain/loss
  const residual = r2(p.netProfit - (p.revenue - operatingExpenses - p.financeExp));
  const otherIncome = residual > 0 ? residual : 0;
  const otherGainsLosses = residual < 0 ? residual : 0;
  const employeeR = r2(employee);
  const pbt = r2(revenue + otherIncome + otherGainsLosses - employeeR - otherExpenses - financeCosts);
  return { revenue, otherIncome, otherGainsLosses, employee: employeeR, otherExpenses, financeCosts, pbt, tax: 0, profit: pbt, reportedPbt: r2(p.netProfit) };
}

export function buildAcraPack(input: AcraBuildInput): AcraPack {
  const t = tt(input.isZh);
  const dates = acraPeriodDates(input.year, input.fyeMonth);
  const cSfp = sfpOf(input.current.bs);
  const pSfp = sfpOf(input.prior.bs);
  const cPl = plOf(input.current.pnl);
  const pPl = plOf(input.prior.pnl);

  // ACRA's size test decides the template; the admin can still force one.
  const rev = cPl?.revenue ?? 0;
  const assets = cSfp?.reportedAssets ?? 0;
  const smaller = rev <= SMALLER_COMPANY_LIMIT && assets <= SMALLER_COMPANY_LIMIT;
  const template: AcraTemplate = input.template ?? (smaller ? "Simplified XBRL" : "Full XBRL");
  const templateReason = input.template
    ? t("按您的选择使用此模板。", "Template chosen manually.")
    : smaller
      ? t(`营业收入（${rev.toLocaleString("en-US")}）和总资产（${assets.toLocaleString("en-US")}）均不超过 S$500,000 → ACRA「小型公司」，可使用简化版 XBRL。`, `Revenue (${rev.toLocaleString("en-US")}) and total assets (${assets.toLocaleString("en-US")}) are both within S$500,000 → ACRA "smaller company", Simplified XBRL applies.`)
      : t(`营业收入（${rev.toLocaleString("en-US")}）或总资产（${assets.toLocaleString("en-US")}）超过 S$500,000 → 须使用完整版 XBRL（约 210 个数据元素）。`, `Revenue (${rev.toLocaleString("en-US")}) or total assets (${assets.toLocaleString("en-US")}) is above S$500,000 → Full XBRL (about 210 data elements) applies.`);

  const L: AcraLine[] = [];
  const val = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? null : v);
  const sfp = (element: string, label: string, side: "debit" | "credit", kind: "item" | "subtotal", c: number | undefined, p: number | undefined, source: string) =>
    L.push({ section: "sfp", element: `sg-as:${element}`, label, period: "instant", side, kind, current: val(c), prior: val(p), source });
  const pl = (element: string, label: string, side: "debit" | "credit", kind: "item" | "subtotal", c: number | undefined, p: number | undefined, source: string) =>
    L.push({ section: "pl", element: `sg-as:${element}`, label, period: "duration", side, kind, current: c ?? null, prior: p ?? null, source });

  const bsNote = t("资产负债表（年末存档）", "Balance sheet (year-end archive)");
  const synced = t("；需同步后才有明细", "; detail fills in after a sync");
  // Statement of financial position
  sfp("CashAndBankBalances", t("现金及银行结余", "Cash and bank balances"), "debit", "item", cSfp?.cash, pSfp?.cash, `${bsNote}: cash`);
  sfp("TradeAndOtherReceivablesCurrent", t("贸易及其他应收款（流动）", "Trade and other receivables (current)"), "debit", "item", cSfp?.recv, pSfp?.recv, `${bsNote}: receivables${synced}`);
  sfp("Inventories", t("存货", "Inventories"), "debit", "item", cSfp?.inv, pSfp?.inv, `${bsNote}: inventory${synced}`);
  sfp("OtherCurrentNonfinancialAssets", t("其他流动非金融资产", "Other current non-financial assets"), "debit", "item", cSfp?.otherCurNonFin, pSfp?.otherCurNonFin, `${bsNote}: operating assets − receivables − inventory`);
  sfp("OtherCurrentFinancialAssets", t("其他流动金融资产（往来/过渡账户）", "Other current financial assets (clearing accounts)"), "debit", "item", cSfp?.clearing, pSfp?.clearing, `${bsNote}: clearing accounts`);
  sfp("CurrentAssets", t("流动资产合计", "Current assets"), "debit", "subtotal", cSfp?.currentAssets, pSfp?.currentAssets, t("上述流动资产之和", "Sum of the current assets above"));
  sfp("PropertyPlantAndEquipment", t("物业、厂房及设备", "Property, plant and equipment"), "debit", "item", cSfp?.ppe, pSfp?.ppe, `${bsNote}: fixed assets`);
  sfp("OtherNoncurrentFinancialAssets", t("其他非流动金融资产", "Other non-current financial assets"), "debit", "item", cSfp?.otherNcFin, pSfp?.otherNcFin, `${bsNote}: financial assets`);
  sfp("NoncurrentAssets", t("非流动资产合计", "Non-current assets"), "debit", "subtotal", cSfp?.nonCurrentAssets, pSfp?.nonCurrentAssets, t("上述非流动资产之和", "Sum of the non-current assets above"));
  sfp("Assets", t("资产总计", "Total assets"), "debit", "subtotal", cSfp?.assets, pSfp?.assets, t("流动 + 非流动资产", "Current + non-current assets"));
  sfp("TradeAndOtherPayablesCurrent", t("贸易及其他应付款（流动）", "Trade and other payables (current)"), "credit", "item", cSfp?.payables, pSfp?.payables, `${bsNote}: operating liabilities`);
  sfp("CurrentLoansAndBorrowings", t("流动借款", "Current loans and borrowings"), "credit", "item", cSfp?.curLoans, pSfp?.curLoans, `${bsNote}: loan accounts due within a year${synced}`);
  sfp("OtherCurrentFinancialLiabilities", t("其他流动金融负债（租赁等）", "Other current financial liabilities (leases etc.)"), "credit", "item", cSfp?.otherCurFin, pSfp?.otherCurFin, `${bsNote}: financial liabilities due within a year${synced}`);
  sfp("CurrentLiabilities", t("流动负债合计", "Current liabilities"), "credit", "subtotal", cSfp?.currentLiabilities, pSfp?.currentLiabilities, t("上述流动负债之和", "Sum of the current liabilities above"));
  sfp("NoncurrentLoansAndBorrowings", t("非流动借款", "Non-current loans and borrowings"), "credit", "item", cSfp?.ncLoans, pSfp?.ncLoans, `${bsNote}: loan accounts − current portion`);
  sfp("OtherNoncurrentFinancialLiabilities", t("其他非流动金融负债", "Other non-current financial liabilities"), "credit", "item", cSfp?.otherNcFinLiab, pSfp?.otherNcFinLiab, `${bsNote}: financial liabilities − current portion`);
  sfp("NoncurrentLiabilities", t("非流动负债合计", "Non-current liabilities"), "credit", "subtotal", cSfp?.nonCurrentLiabilities, pSfp?.nonCurrentLiabilities, t("上述非流动负债之和", "Sum of the non-current liabilities above"));
  sfp("Liabilities", t("负债总计", "Total liabilities"), "credit", "subtotal", cSfp?.liabilities, pSfp?.liabilities, t("流动 + 非流动负债", "Current + non-current liabilities"));
  sfp("ShareCapital", t("股本", "Share capital"), "credit", "item", cSfp?.shareCapital, pSfp?.shareCapital, `${bsNote}: share capital account`);
  sfp("AccumulatedProfitsLosses", t("累计盈亏及其他权益", "Accumulated profits (losses) and other equity"), "credit", "item", cSfp?.accumulated, pSfp?.accumulated, `${bsNote}: total equity − share capital`);
  sfp("Equity", t("权益合计", "Total equity"), "credit", "subtotal", cSfp?.equity, pSfp?.equity, t("股本 + 累计盈亏及其他权益", "Share capital + accumulated profits and other equity"));

  // Statement of profit or loss (by nature)
  const plSrc = t("利润表（财年合计）", "Profit and loss (financial-year total)");
  pl("Revenue", t("营业收入", "Revenue"), "credit", "item", cPl?.revenue, pPl?.revenue, `${plSrc}: revenue`);
  pl("OtherIncome", t("其他收入", "Other income"), "credit", "item", cPl?.otherIncome, pPl?.otherIncome, t("账面利润超出（收入 − 费用）的正数部分", "Profit above (revenue − expenses), when positive"));
  pl("OtherGainsLosses", t("其他利得/（损失）", "Other gains / (losses)"), "credit", "item", cPl?.otherGainsLosses, pPl?.otherGainsLosses, t("账面利润低于（收入 − 费用）的差额", "Profit below (revenue − expenses), when negative"));
  pl("EmployeeBenefitsExpense", t("员工福利费用", "Employee benefits expense"), "debit", "item", cPl?.employee, pPl?.employee, `${plSrc}: ${t("工资、公积金（CPF）等人工成本", "salaries, CPF and other employment cost")}`);
  pl("OtherExpensesByNature", t("其他费用（按性质）", "Other expenses by nature"), "debit", "item", cPl?.otherExpenses, pPl?.otherExpenses, t("营业成本 + 销售 + 管理 + 研发费用 − 员工费用（含折旧，需账目明细才能拆分）", "Cost of sales + selling + admin + R&D − employee cost (includes depreciation; the ledger detail is needed to split it)"));
  pl("FinanceCosts", t("财务费用", "Finance costs"), "debit", "item", cPl?.financeCosts, pPl?.financeCosts, `${plSrc}: ${t("财务费用", "finance expense")}`);
  pl("ProfitLossBeforeTaxation", t("税前利润/（亏损）", "Profit (loss) before taxation"), "credit", "subtotal", cPl?.pbt, pPl?.pbt, t("收入 + 其他收益 − 费用", "Revenue + other income − expenses"));
  pl("TaxExpenseBenefitContinuingOperations", t("所得税费用", "Income tax expense"), "debit", "item", cPl?.tax, pPl?.tax, t("账内未入账所得税，如已入账请在账目中调整", "No income tax is booked in the ledger — adjust once it is"));
  pl("ProfitLoss", t("本年利润/（亏损）", "Profit (loss) for the year"), "credit", "subtotal", cPl?.profit, pPl?.profit, t("税前利润 − 所得税", "Profit before tax − income tax"));
  pl("ProfitLossAttributableToOwnersOfCompany", t("归属于公司股东的利润", "Profit attributable to owners of the company"), "credit", "subtotal", cPl?.profit, pPl?.profit, t("无非控制性权益时等于本年利润", "Equals profit for the year when there are no non-controlling interests"));

  // Cash flow — totals only; the Simplified template has no cash flow statement
  const cfSrc = t("现金流量表（由资产负债表变动推算）", "Cash flow (derived from balance-sheet movements)");
  const cf = (element: string, label: string, side: "debit" | "credit", c: number | undefined, p: number | undefined) =>
    L.push({ section: "cf", element: `sg-as:${element}`, label, period: "duration", side, kind: "item", current: c ?? null, prior: p ?? null, source: cfSrc, fullOnly: true });
  cf("CashFlowsFromUsedInOperatingActivities", t("经营活动现金流量", "Net cash flows from (used in) operating activities"), "credit", input.current.cf ? r2(input.current.cf.ocf) : undefined, input.prior.cf ? r2(input.prior.cf.ocf) : undefined);
  cf("CashFlowsFromUsedInInvestingActivities", t("投资活动现金流量", "Net cash flows from (used in) investing activities"), "debit", input.current.cf ? r2(input.current.cf.icf) : undefined, input.prior.cf ? r2(input.prior.cf.icf) : undefined);
  cf("CashFlowsFromUsedInFinancingActivities", t("筹资活动现金流量", "Net cash flows from (used in) financing activities"), "debit", input.current.cf ? r2(input.current.cf.fcf) : undefined, input.prior.cf ? r2(input.prior.cf.fcf) : undefined);

  // ---- checks ----
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.02;
  const checks: AcraCheck[] = [];
  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!cSfp) {
    checks.push({ id: "bs-present", label: t("年末资产负债表", "Year-end balance sheet"), ok: false, detail: t(`没有 ${dates.end} 的资产负债表快照——请先同步（同步会自动存档月末资产负债表）。`, `No balance sheet is archived for ${dates.end} — run a sync (it archives each month-end balance sheet).`) });
  } else {
    checks.push({ id: "bs-present", label: t("年末资产负债表", "Year-end balance sheet"), ok: true, detail: t(`已存档（${dates.end}）。`, `Archived for ${dates.end}.`) });
    checks.push({ id: "bs-equation", label: t("资产 = 负债 + 权益", "Assets = liabilities + equity"), ok: near(cSfp.assets, cSfp.liabilities + cSfp.equity), detail: `${fmt(cSfp.assets)} = ${fmt(cSfp.liabilities)} + ${fmt(cSfp.equity)}` });
    if (!input.current.bs?.totalsOnly) checks.push({ id: "bs-ties", label: t("各分类之和 = 账面总资产", "Classified total = ledger total assets"), ok: near(cSfp.assets, cSfp.reportedAssets), detail: `${fmt(cSfp.assets)} ↔ ${fmt(cSfp.reportedAssets)}` });
    if (!input.current.bs?.totalsOnly) checks.push({ id: "bs-equity", label: t("股本", "Share capital"), ok: input.current.bs?.equityDetailed ? true : false, detail: input.current.bs?.equityDetailed ? t("已从权益科目取得。", "Read from the equity accounts.") : t("尚未取得股本——请执行一次「全部同步」，否则全部权益暂列于「累计盈亏及其他权益」。", 'Share capital not captured yet — run "Sync all"; until then all equity sits under "accumulated profits and other equity".') });
    if (!input.current.bs?.totalsOnly) checks.push({ id: "bs-detail", label: t("应收款/存货/流动非流动拆分", "Receivables, inventory and current / non-current split"), ok: cSfp.detailed, detail: cSfp.detailed ? t("已取得。", "Captured.") : t("尚未取得——请执行一次「全部同步」，这些行现在并入「其他」。", 'Not captured yet — run "Sync all"; until then these lines are folded into "other".') });
  }
  if (!cPl) {
    checks.push({ id: "pl-present", label: t("财年利润表", "Financial-year profit and loss"), ok: false, detail: t("该财年没有利润表数据。", "No profit and loss data for this financial year.") });
  } else {
    checks.push({ id: "pl-present", label: t("财年利润表", "Financial-year profit and loss"), ok: true, detail: t("12 个月合计。", "Twelve-month total.") });
    const spend = (input.current.pnl?.costOfSales ?? 0) + (input.current.pnl?.sellExp ?? 0) + (input.current.pnl?.adminExp ?? 0) + (input.current.pnl?.rndExp ?? 0);
    checks.push({ id: "pl-employee", label: t("员工福利费用", "Employee benefits expense"), ok: cPl.employee > 0 || spend === 0 ? true : null, detail: cPl.employee > 0 ? t("已从利润表人工成本科目取得。", "Read from the employment-cost accounts in the profit and loss.") : t("为 0：要么没有人工成本，要么尚未取得——请执行「全部同步」后再看。", 'It is 0: either there is none or it has not been captured yet — run "Sync all" and look again.') });
    checks.push({ id: "pl-ties", label: t("税前利润 = 账面净利润", "Profit before tax = ledger net profit"), ok: near(cPl.pbt, cPl.reportedPbt), detail: `${fmt(cPl.pbt)} ↔ ${fmt(cPl.reportedPbt)}` });
  }
  if (cPl && cSfp) {
    const prevEq = pSfp?.equity;
    if (prevEq !== undefined) {
      const move = r2(cSfp.equity - prevEq);
      checks.push({ id: "equity-roll", label: t("权益变动 vs 本年利润", "Movement in equity vs profit for the year"), ok: null, detail: t(`权益变动 ${fmt(move)}，本年利润 ${fmt(cPl.profit)}；差额 ${fmt(r2(move - cPl.profit))} 为股本、股息或其他权益变动，请核对。`, `Equity moved ${fmt(move)} against profit of ${fmt(cPl.profit)}; the ${fmt(r2(move - cPl.profit))} difference is share capital, dividends or other equity movements — please confirm.`) });
    }
  }
  checks.push({ id: "name", label: t("公司名称", "Company name"), ok: null, detail: t(`申报名称为“${input.entityName}”——必须与 ACRA 登记名称（含 Pte Ltd 等）完全一致，不一致请在设置中修改。`, `Filed as "${input.entityName}" — it must match the ACRA-registered name exactly (including Pte Ltd etc.); change it in Settings if it differs.`) });
  if (!input.uen) checks.push({ id: "uen", label: t("公司 UEN", "Company UEN"), ok: false, detail: t("ACRA 申报必须有 UEN（9 位数字 + 1 个字母）；请在上方填写。", "ACRA filings need the UEN (9 digits + 1 letter) — enter it above.") });
  else if (!/^[0-9]{9}[A-Za-z]$/.test(input.uen)) checks.push({ id: "uen", label: t("公司 UEN", "Company UEN"), ok: false, detail: t(`“${input.uen}”不符合 ACRA 对公司 UEN 的格式（9 位数字 + 1 个字母）。`, `"${input.uen}" is not in ACRA's company UEN format (9 digits + 1 letter).`) });
  else checks.push({ id: "uen", label: t("公司 UEN", "Company UEN"), ok: true, detail: input.uen.toUpperCase() });
  if (input.scope === "group") checks.push({ id: "group", label: t("合并范围", "Consolidation scope"), ok: null, detail: t("合并数为各主体直接相加，未做内部往来抵销，不能直接作为合并财务报表申报。", "Group figures are a straight sum of the entities with no intercompany eliminations, so they are not a filing-ready consolidation.") });

  checks.push(...(input.extraChecks ?? []));
  const todo = [
    t("董事声明（真实与公允、偿债能力）和独立审计师报告相关事项——须由公司董事 / 审计师确认。", "Directors' statement (true and fair view, ability to pay debts) and the independent auditor's report items — to be confirmed by the directors and auditor."),
    t("财务报表附注（物业、厂房及设备变动、无形资产、关联方、借款等明细）——本系统只有汇总数据，需由会计师补充。", "Notes to the financial statements (PPE movement, intangibles, related parties, borrowings…) — the platform holds totals only, so the accountant completes them."),
    t("员工人数、主要业务描述、授权发出财务报表日期及是否持续经营等申报信息。", "Number of employees, nature of operations, date of authorisation for issue and going-concern basis."),
    t("提交前请在 ACRA BizFinx 预备工具中打开并验证；ACRA 的官方申报途径是 BizFinx、经认可的会计软件或企业服务提供商。", "Open and validate the file in ACRA's BizFinx before filing — ACRA's filing routes are BizFinx, approved accounting software or a corporate service provider."),
  ];
  const readyForInstance = Boolean(cSfp && cPl);
  return { taxonomy: ACRA_TAXONOMY_LABEL, template, templateReason, entityName: input.entityName, uen: input.uen ? input.uen.toUpperCase() : null, scope: input.scope, year: input.year, periodStart: dates.start, periodEnd: dates.end, priorStart: dates.priorStart, priorEnd: dates.priorEnd, lines: L, checks, todo, readyForInstance };
}

// ---------------------------------------------------------------------------------------------
// Output files
// ---------------------------------------------------------------------------------------------
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const compact = (d: string) => d.replace(/-/g, "");

export function linesForTemplate(pack: AcraPack): AcraLine[] {
  return pack.template === "Full XBRL" ? pack.lines : pack.lines.filter((l) => !l.fullOnly);
}

export function acraFileBase(pack: AcraPack): string {
  return `ce${pack.uen ?? "UEN"}-${compact(pack.periodEnd)}`;
}

/** XBRL 2.1 instance pointing straight at ACRA's published entry-point schema. */
export function buildAcraInstanceXml(pack: AcraPack, opts: { accountingFramework: "SFRS_I" | "SFRS_SE"; software?: string }): string {
  const ctxCur = `fromto_${compact(pack.periodStart)}_${compact(pack.periodEnd)}`;
  const ctxPri = `fromto_${compact(pack.priorStart)}_${compact(pack.priorEnd)}`;
  const ctxEnd = `asof_${compact(pack.periodEnd)}`;
  const ctxPriEnd = `asof_${compact(pack.priorEnd)}`;
  const uen = pack.uen ?? "";
  const ident = `<xbrli:entity><xbrli:identifier scheme="http://www.bizfinx.gov.sg/UEN">${esc(uen)}</xbrli:identifier></xbrli:entity>`;
  const ctx = (id: string, period: string) => `<xbrli:context id="${id}">${ident}<xbrli:period>${period}</xbrli:period></xbrli:context>`;
  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="utf-8"?>`);
  out.push(`<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:link="http://www.xbrl.org/2003/linkbase" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:sg-dei="${NS["sg-dei"]}" xmlns:sg-as="${NS["sg-as"]}">`);
  out.push(`<link:schemaRef xlink:type="simple" xlink:href="${ACRA_ENTRY_POINT[pack.template]}" />`);
  out.push(ctx(ctxCur, `<xbrli:startDate>${pack.periodStart}</xbrli:startDate><xbrli:endDate>${pack.periodEnd}</xbrli:endDate>`));
  out.push(ctx(ctxPri, `<xbrli:startDate>${pack.priorStart}</xbrli:startDate><xbrli:endDate>${pack.priorEnd}</xbrli:endDate>`));
  out.push(ctx(ctxEnd, `<xbrli:instant>${pack.periodEnd}</xbrli:instant>`));
  out.push(ctx(ctxPriEnd, `<xbrli:instant>${pack.priorEnd}</xbrli:instant>`));
  out.push(`<xbrli:unit id="SGD"><xbrli:measure>iso4217:SGD</xbrli:measure></xbrli:unit>`);

  const text = (el: string, ctxId: string, value: string) => out.push(`<${el} contextRef="${ctxId}">${esc(value)}</${el}>`);
  // Filing information (enumeration values are the ones defined in the taxonomy's sg-types)
  text("sg-dei:NameOfCompany", ctxCur, pack.entityName);
  text("sg-dei:UniqueEntityNumber", ctxCur, uen);
  text("sg-dei:CurrentPeriodStartDate", ctxEnd, pack.periodStart);
  text("sg-dei:CurrentPeriodEndDate", ctxEnd, pack.periodEnd);
  text("sg-dei:PriorPeriodStartDate", ctxEnd, pack.priorStart);
  text("sg-dei:TypeOfXBRLFiling", ctxCur, pack.template);
  text("sg-dei:NatureOfFinancialStatementsCompanyLevelOrConsolidated", ctxCur, pack.scope === "group" ? "Consolidated" : "Company level");
  text("sg-dei:TypeOfAccountingStandardUsedToPrepareFinancialStatements", ctxCur, opts.accountingFramework === "SFRS_SE" ? "SFRS for Small entities" : "SFRS(I) (including simultaneous compliance with IFRS)");
  text("sg-dei:TypeOfStatementOfFinancialPosition", ctxCur, "Current and non-current");
  text("sg-dei:DescriptionOfPresentationCurrency", ctxCur, "SGD");
  text("sg-as:DescriptionOfFunctionalCurrency", ctxCur, "SGD");
  text("sg-dei:LevelOfRoundingUsedInFinancialStatements", ctxCur, "Actual");
  text("sg-dei:TaxonomyVersion", ctxCur, ACRA_TAXONOMY_VERSION[pack.template]);
  text("sg-dei:NameAndVersionOfSoftwareUsedToGenerateInstanceDocument", ctxCur, opts.software ?? "SMT Finance Analysis Platform");
  text("sg-dei:HowWasXBRLInstanceDocumentPrepared", ctxCur, "In-house");

  for (const l of linesForTemplate(pack)) {
    const cc = l.period === "instant" ? ctxEnd : ctxCur;
    const pc = l.period === "instant" ? ctxPriEnd : ctxPri;
    if (l.current !== null) out.push(`<${l.element} contextRef="${cc}" unitRef="SGD" decimals="2">${l.current}</${l.element}>`);
    if (l.prior !== null) out.push(`<${l.element} contextRef="${pc}" unitRef="SGD" decimals="2">${l.prior}</${l.element}>`);
  }
  out.push(`</xbrli:xbrl>`);
  return out.join("\n") + "\n";
}

const csvCell = (s: string | number | null) => {
  const v = s === null ? "" : String(s);
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
export function buildAcraCsv(pack: AcraPack): string {
  const rows: (string | number | null)[][] = [["Section", "ACRA element", "Label", "Type", "Balance", "FY " + pack.periodEnd, "Prior FY " + pack.priorEnd, "Source"]];
  const secName: Record<LineSection, string> = { sfp: "Statement of financial position", pl: "Statement of profit or loss", cf: "Cash flow statement" };
  for (const l of linesForTemplate(pack)) rows.push([secName[l.section], l.element, l.label, l.kind === "subtotal" ? "Subtotal" : "Item", l.side, l.current, l.prior, l.source]);
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

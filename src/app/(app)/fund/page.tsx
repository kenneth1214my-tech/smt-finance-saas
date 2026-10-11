import { Wallet, TrendingUp, TrendingDown, Landmark, CreditCard, AlertTriangle, Scale } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney, scaleMoney } from "@/lib/i18n/dictionaries";
import { monthLabels, localizedName } from "@/lib/localize";
import { getBaseCurrency, getExchangeRates, convertToBase } from "@/lib/currency";
import { classifyBankAccount, normalizeBankName, splitLoanTerm } from "@/lib/bank-classify";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import EntityScopeFilter, { type EntityScope } from "@/components/ui/EntityScopeFilter";
import TrendChart from "@/components/ui/TrendChart";
import PeriodSelector from "@/components/PeriodSelector";
import { parsePeriod, periodEndDate } from "@/lib/period";
import { getReportYears } from "@/lib/period-server";
import BarChart from "@/components/ui/BarChart";
import KpiBreakdown from "@/components/ui/KpiBreakdown";
import { buildFlowSections, type BreakdownSection } from "@/lib/treasury-breakdown";

const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const BANK_TYPE_KEY: Record<string, keyof ReturnType<typeof getDictionary>["m"]> = { main: "bankTypeMain", general: "bankTypeGeneral", fx: "bankTypeFx" };

export default async function FundPage(props: PageProps<"/fund">) {
  const user = await requireUser();
  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const searchParams = await props.searchParams;
  const period = parsePeriod(searchParams);
  const scopeParam = typeof searchParams.scope === "string" ? searchParams.scope : "all";
  const scope: EntityScope = scopeParam === "hq" || scopeParam === "subsidiary" ? scopeParam : "all";
  // null subsidiaryId = Group HQ; "Total" is HQ + every subsidiary.
  const subsidiaryFilter = scope === "hq" ? { subsidiaryId: null } : scope === "subsidiary" ? { subsidiaryId: { not: null } } : {};

  const organizationId = user.organizationId;
  const banks = await db.bankAccount.findMany({ where: { organizationId, ...subsidiaryFilter }, include: { subsidiary: true }, orderBy: { balance: "desc" } });
  const cashflowRows = await db.cashFlowMonthly.findMany({ where: { year: period.year, month: { gte: period.fromMonth, lte: period.toMonth }, organizationId, ...subsidiaryFilter }, orderBy: { month: "asc" } });
  // Each entity records its own row per month, so "Total" must add them up per month rather than
  // treating every row as its own month.
  const cashflowByMonth = new Map<number, { month: number; ocf: number; icf: number; fcf: number }>();
  for (const r of cashflowRows) {
    const m = cashflowByMonth.get(r.month) ?? { month: r.month, ocf: 0, icf: 0, fcf: 0 };
    m.ocf += Number(r.ocf);
    m.icf += Number(r.icf);
    m.fcf += Number(r.fcf);
    cashflowByMonth.set(r.month, m);
  }
  const cashflow = [...cashflowByMonth.values()].sort((a, b) => a.month - b.month);
  const baseCurrency = await getBaseCurrency(organizationId);
  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);
  const fmtM = (n: number) => fmtMoney(n, locale);
  const rates = await getExchangeRates(organizationId);

  // Same rule as the Overview: any month-end (or a past year) is reported from the balance sheet stored
  // for that month-end, not from today's bank balances. Stored balances are in each entity's own
  // (base) currency — the entities here share one — and have no per-account detail.
  const reportYears = await getReportYears(organizationId, period.year);
  const useSnapshot = period.basis !== "year" || period.year !== new Date().getFullYear();
  const [snapshotRows, monthlyCashRows] = await Promise.all([
    useSnapshot ? db.balanceSheetMonthly.findMany({ where: { organizationId, year: period.year, month: period.toMonth, ...subsidiaryFilter }, include: { subsidiary: true } }) : Promise.resolve([]),
    db.balanceSheetMonthly.findMany({ where: { organizationId, year: period.year, month: { lte: period.toMonth }, ...subsidiaryFilter }, select: { month: true, cash: true } }),
  ]);
  const snapshotActive = useSnapshot && snapshotRows.length > 0;
  const cashByMonth = new Map<number, number>();
  for (const r of monthlyCashRows) cashByMonth.set(r.month, (cashByMonth.get(r.month) ?? 0) + Number(r.cash));
  const cashTrendMonths = [...cashByMonth.keys()].sort((a, b) => a - b);

  // Bank balances are entered per-account currency; convert each to the base currency before
  // summing, rather than adding raw CNY+USD+HKD figures together. When a currency has no
  // exchange rate on file yet, fall back to the raw amount and flag it instead of silently
  // misconverting.
  const bankRows = banks.map((b) => {
    const original = Number(b.balance);
    const converted = convertToBase(original, b.currency, baseCurrency, rates);
    return { ...b, original, converted: converted ?? original, hasRate: converted !== null, kind: classifyBankAccount(b.bankEn) };
  });
  const missingRateCurrencies = Array.from(new Set(bankRows.filter((b) => !b.hasRate).map((b) => b.currency)));

  // Only real cash accounts count toward Cash Balance: Xero's Bank Summary also lists loan and
  // clearing accounts (see bank-classify.ts), and a -1.2M term loan was dragging cash negative.
  const totalBank = bankRows.filter((b) => b.kind === "cash").reduce((a, b) => a + b.converted, 0);
  const debtRows = bankRows.filter((b) => b.kind === "debt");
  const totalBorrowings = 0 - debtRows.reduce((a, b) => a + b.converted, 0); // 0 - x, not -x, so an empty list is 0 rather than -0
  // One row per loan: "<Loan>-Current" and "<Loan>-Non Current" accounts are the two portions of
  // the same loan, so group them. A loan with no current/non-current suffix lands in "unspecified"
  // (counted in the total, not forced into either bucket).
  const loanMap = new Map<string, { key: string; base: string; owner: string; current: number; longTerm: number; unspecified: number }>();
  for (const d of debtRows) {
    const { base, term } = splitLoanTerm(d.bankEn);
    const owner = d.subsidiary ? localizedName(d.subsidiary, locale) : isZh ? "集团总部" : "Group HQ";
    const key = `${d.subsidiaryId ?? "HQ"}|${base.toLowerCase()}`;
    const loan = loanMap.get(key) ?? { key, base, owner, current: 0, longTerm: 0, unspecified: 0 };
    const owed = -d.converted;
    if (term === "current") loan.current += owed;
    else if (term === "noncurrent") loan.longTerm += owed;
    else loan.unspecified += owed;
    loanMap.set(key, loan);
  }
  const loans = [...loanMap.values()].sort((a, b) => b.current + b.longTerm + b.unspecified - (a.current + a.longTerm + a.unspecified));
  const borrowingsCurrent = loans.reduce((a, l) => a + l.current, 0);
  const borrowingsLongTerm = loans.reduce((a, l) => a + l.longTerm, 0);
  const excludedClearing = bankRows.filter((b) => b.kind === "clearing");
  const hasCashFlow = cashflow.length > 0;

  const dupGroups = new Map<string, string[]>();
  for (const b of bankRows) {
    if (b.kind !== "cash") continue;
    const key = `${b.subsidiaryId ?? "HQ"}|${normalizeBankName(b.bankEn)}`;
    dupGroups.set(key, [...(dupGroups.get(key) ?? []), b.bankEn]);
  }
  const probableDuplicates = [...dupGroups.values()].filter((names) => names.length > 1);
  const cashBalance = snapshotActive ? snapshotRows.reduce((a, r) => a + Number(r.cash), 0) : totalBank;
  const borrowings = snapshotActive ? 0 - snapshotRows.reduce((a, r) => a + Number(r.loans), 0) : totalBorrowings;
  const totalOcf = cashflow.reduce((a, c) => a + c.ocf, 0);
  const totalIcf = cashflow.reduce((a, c) => a + c.icf, 0);
  const totalFcf = cashflow.reduce((a, c) => a + c.fcf, 0);

  // ---- Workings behind each KPI tile (see KpiBreakdown) ----
  const t = (zh: string, en: string) => (isZh ? zh : en);
  const hqLabel = t("集团总部", "Group HQ");
  const ownerName = (sub: Parameters<typeof localizedName>[0] | null) => (sub ? localizedName(sub, locale) : hqLabel);
  const flowSections = hasCashFlow ? await buildFlowSections({ organizationId, year: period.year, fromMonth: period.fromMonth, toMonth: period.toMonth, subsidiaryFilter, locale, isZh }) : [];
  const flowById = new Map(flowSections.map((x) => [x.id, x]));
  const periodEnd = periodEndDate(period);

  const cashSection: BreakdownSection = snapshotActive
    ? {
        id: "cash",
        title: dict.m.cashBalance,
        result: cashBalance,
        formula: t(`所选月末（${periodEnd}）各主体 Xero 资产负债表中「银行」栏现金类账户余额之和（贷款与过渡账户已剔除）`, `Sum of each entity's cash-type bank accounts on its Xero balance sheet at month-end ${periodEnd} (loan and clearing accounts excluded)`),
        cols: [t("现金", "Cash")],
        rows: [
          ...[...snapshotRows].sort((a, b) => Number(b.cash) - Number(a.cash)).map((r) => ({ label: ownerName(r.subsidiary), values: [Number(r.cash)] })),
          { label: t("现金余额合计", "Cash balance"), values: [cashBalance], kind: "total" as const },
        ],
        notes: [t("月末数据来自每次 Xero 同步存档的资产负债表（仅有主体级合计，无账户级明细）。", "Month-end figures come from the balance sheet archived on each Xero sync (entity totals only, no per-account detail).")],
      }
    : {
        id: "cash",
        title: dict.m.cashBalance,
        result: cashBalance,
        formula: t(`所有「现金类」银行账户余额按汇率折合 ${baseCurrency} 后相加；贷款账户与过渡/清算账户不是现金，已剔除`, `Add up every cash-type bank account, each converted to ${baseCurrency}; loan accounts and clearing/suspense accounts are not cash and are excluded`),
        cols: [t(`折合 ${baseCurrency}`, `In ${baseCurrency}`)],
        rows: [
          ...bankRows.filter((b) => b.kind === "cash").map((b) => ({ label: `${b.bankEn} · ${ownerName(b.subsidiary)}`, hint: b.currency !== baseCurrency ? `${fmtM(b.original)} ${b.currency}` : undefined, values: [b.converted] })),
          { label: t("现金余额合计", "Cash balance"), values: [totalBank], kind: "total" as const },
          ...[...debtRows, ...excludedClearing].map((b) => ({
            label: `${b.bankEn} · ${ownerName(b.subsidiary)}`,
            hint: b.kind === "debt" ? t("贷款账户 — 计入借款，不计入现金", "Loan account — counted under borrowings, not cash") : t("过渡/清算账户 — 已剔除", "Clearing account — excluded"),
            values: [b.converted],
            kind: "muted" as const,
          })),
        ],
        notes: [t("灰色行不计入现金余额。", "Greyed rows are not part of the cash balance.")],
      };

  const borrowingsSection: BreakdownSection = snapshotActive
    ? {
        id: "borrowings",
        title: isZh ? "银行借款余额" : "Bank borrowings",
        result: borrowings,
        formula: t(`所选月末（${periodEnd}）各主体 Xero 资产负债表「银行」栏中贷款类账户余额之和，取相反数（贷款账户在 Xero 中为负数）`, `Sum of each entity's loan-type accounts on its Xero balance sheet at month-end ${periodEnd}, sign flipped (loan accounts are negative in Xero)`),
        cols: [t("借款", "Borrowings")],
        rows: [
          ...[...snapshotRows].map((r) => ({ label: ownerName(r.subsidiary), values: [0 - Number(r.loans)] })),
          { label: t("借款合计", "Total borrowings"), values: [borrowings], kind: "total" as const },
        ],
        notes: [t("按贷款拆分（一年内 / 长期）仅提供最新余额。", "The per-loan current / long-term split is available for the latest balances only.")],
      }
    : {
        id: "borrowings",
        title: isZh ? "银行借款余额" : "Bank borrowings",
        result: borrowings,
        formula: t("所有贷款类银行账户余额取相反数后相加（贷款账户在 Xero 中为负数）；「…-Current」为一年内到期，「…-Non Current」为长期", "Add up every loan-type account with its sign flipped (loans are negative in Xero); \"…-Current\" accounts are due within a year, \"…-Non Current\" are long-term"),
        cols: [t("一年内到期", "Current"), t("长期", "Long-term"), t("合计", "Total")],
        rows: [
          ...loans.map((l) => ({ label: `${l.base} · ${l.owner}`, values: [l.current, l.longTerm, l.current + l.longTerm + l.unspecified] })),
          { label: t("借款合计", "Total borrowings"), values: [borrowingsCurrent, borrowingsLongTerm, totalBorrowings], kind: "total" as const },
        ],
      };

  const entityNet = new Map<string, { label: string; cash: number; borrow: number }>();
  if (snapshotActive) {
    for (const r of snapshotRows) entityNet.set(r.subsidiaryId ?? "HQ", { label: ownerName(r.subsidiary), cash: Number(r.cash), borrow: 0 - Number(r.loans) });
  } else {
    for (const b of bankRows) {
      const e = entityNet.get(b.subsidiaryId ?? "HQ") ?? { label: ownerName(b.subsidiary), cash: 0, borrow: 0 };
      if (b.kind === "cash") e.cash += b.converted;
      else if (b.kind === "debt") e.borrow += -b.converted;
      entityNet.set(b.subsidiaryId ?? "HQ", e);
    }
  }
  const netCashSection: BreakdownSection = {
    id: "netcash",
    title: isZh ? "净现金（现金 − 借款）" : "Net cash (cash − borrowings)",
    result: cashBalance - borrowings,
    formula: t("现金余额 − 银行借款余额；为负表示借款超过现金", "Cash balance − bank borrowings; negative means borrowings exceed cash"),
    cols: [t("现金", "Cash"), t("借款", "Borrowings"), t("净现金", "Net cash")],
    rows: [
      ...[...entityNet.values()].map((e) => ({ label: e.label, values: [e.cash, e.borrow, e.cash - e.borrow] })),
      { label: t("合计", "Total"), values: [cashBalance, borrowings, cashBalance - borrowings], kind: "total" as const },
    ],
  };
  const noFlowSection = (id: string, title: string): BreakdownSection => ({ id, title, result: null, formula: noCashFlowShort, cols: [], rows: [] });
  const breakdownSections: BreakdownSection[] = [
    cashSection,
    flowById.get("ocf") ?? noFlowSection("ocf", dict.m.ocf),
    flowById.get("icf") ?? noFlowSection("icf", dict.m.icfNet),
    flowById.get("fcf") ?? noFlowSection("fcf", dict.m.fcfNet),
    borrowingsSection,
    netCashSection,
  ];

  const allMonthLabels = monthLabels(locale, 12);
  const months = cashflow.map((c) => allMonthLabels[c.month - 1]);
  const netFlows = cashflow.map((c) => c.ocf + c.icf + c.fcf);
  const openingBalance = totalBank - netFlows.reduce((a, b) => a + b, 0);
  const balanceByMonth = netFlows.reduce<number[]>((acc, n) => {
    const prev = acc.length ? acc[acc.length - 1] : openingBalance;
    acc.push(Math.round((prev + n) * 100) / 100);
    return acc;
  }, []);

  const noCashFlowShort = isZh ? "暂无现金流数据" : "No cash-flow data";
  const noCashFlowLong = isZh
    ? "本年度暂无现金流量数据。系统会在每次 Xero 同步时，根据月末资产负债表与利润表自动推算经营/投资/筹资现金流（间接法）——请在「设置 → 数据导入与ERP」点击「全部同步」；如未连接 Xero，也可通过「批量导入 → 月度现金流」手动导入。"
    : "No cash-flow data for this year yet. It is derived automatically on every Xero sync from month-end balance sheets and the P&L (indirect method) — click Sync all under Settings → Data Import & ERP, or import monthly cash flow manually if Xero isn't connected.";
  const derivedNote = isZh
    ? "说明：现金流量由 Xero 月末资产负债表与利润表按间接法推算（经营=净利润+折旧±营运资金变动；投资=固定资产变动；筹资=借款、租赁负债、权益变动），三项合计恒等于银行现金的实际变动；并非 Xero 官方现金流量表。"
    : "Derived from Xero month-end balance sheets and the P&L (indirect method): operating = net profit + depreciation ± working-capital changes; investing = fixed-asset changes; financing = loans, lease liabilities and equity changes. The three always sum to the actual change in bank cash — this is not an official Xero statement.";

  return (
    <>
      <Topbar dict={dict} locale={locale} title={dict.nav.fund} desc={dict.nav.fund} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <EntityScopeFilter scope={scope} locale={locale} />
          <PeriodSelector year={period.year} month={period.month} basis={period.basis} years={reportYears} isZh={isZh} />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <KpiTile
            icon={Wallet}
            color="var(--cat-1)"
            label={dict.m.cashBalance}
            value={fmtM(cashBalance)}
            unit={dict.common.yi}
            note={snapshotActive ? (isZh ? `截至 ${periodEndDate(period)} 月末（Xero）` : `Month-end ${periodEndDate(period)} (Xero)`) : `${isZh ? `折合 ${baseCurrency}` : `in ${baseCurrency}`}${useSnapshot ? (isZh ? " · 该月末无存档，用最新余额" : " · no month-end stored, latest balances") : ""}${debtRows.length + excludedClearing.length > 0 ? (isZh ? `，已剔除 ${debtRows.length + excludedClearing.length} 个贷款/过渡账户` : ` · excl. ${debtRows.length + excludedClearing.length} loan/clearing acct`) : ""}`}
          />
          <KpiTile icon={TrendingUp} color="var(--cat-3)" label={dict.m.ocf} value={hasCashFlow ? fmtM(totalOcf) : "—"} unit={hasCashFlow ? dict.common.yi : undefined} note={hasCashFlow ? undefined : noCashFlowShort} />
          <KpiTile icon={TrendingDown} color="var(--cat-2)" label={dict.m.icfNet} value={hasCashFlow ? fmtM(totalIcf) : "—"} unit={hasCashFlow ? dict.common.yi : undefined} note={hasCashFlow ? undefined : noCashFlowShort} />
          <KpiTile icon={Landmark} color="var(--cat-4)" label={dict.m.fcfNet} value={hasCashFlow ? fmtM(totalFcf) : "—"} unit={hasCashFlow ? dict.common.yi : undefined} note={hasCashFlow ? undefined : noCashFlowShort} />
          <KpiTile
            icon={CreditCard}
            color="var(--cat-5)"
            label={isZh ? "银行借款余额" : "Bank Borrowings"}
            value={fmtM(borrowings)}
            unit={dict.common.yi}
            note={snapshotActive ? (isZh ? "月末贷款账户余额" : "Loan accounts at month-end") : isZh ? `一年内 ${fmtM(borrowingsCurrent)} · 长期 ${fmtM(borrowingsLongTerm)}` : `Current ${fmtM(borrowingsCurrent)} · Long-term ${fmtM(borrowingsLongTerm)}`}
          />
          <KpiTile icon={Scale} color="var(--status-warning)" label={isZh ? "净现金（现金 − 借款）" : "Net Cash (cash − borrowings)"} value={fmtM(cashBalance - borrowings)} unit={dict.common.yi} />
        </div>

        {!snapshotActive && probableDuplicates.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-[11.8px]" style={{ background: "color-mix(in srgb, var(--status-warning) 12%, transparent)", color: "var(--status-warning)" }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              {isZh ? "以下银行账户疑似重复录入（同一主体、名称相近），现金余额可能被重复计算，请核对后删除多余的一条：" : "These bank accounts look like duplicates (same entity, near-identical names) — cash may be double-counted. Check and delete the extra row: "}
              {probableDuplicates.map((names) => names.join(" ⇄ ")).join("；")}
            </span>
          </div>
        )}

        <KpiBreakdown
          sections={breakdownSections}
          locale={locale}
          unit={baseCurrency}
          heading={t("指标明细与计算过程", "KPI breakdown & calculation")}
          hint={t("点击展开，查看每个指标的计算公式、逐项明细与核对结果，便于复核。", "Click a KPI to see its formula, line items and tie-out so every figure can be re-checked.")}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={dict.m.cashTrendCard} unit={hasCashFlow ? dict.common.yi : undefined}>
            {cashTrendMonths.length > 0 ? (
              <TrendChart labels={cashTrendMonths.map((m) => allMonthLabels[m - 1])} series={[{ name: dict.m.cashBalance, color: "var(--cat-1)", data: cashTrendMonths.map((m) => scaleMoney(Math.round(cashByMonth.get(m)! * 100) / 100, locale)) }]} />
            ) : hasCashFlow ? (
              <TrendChart labels={months} series={[{ name: dict.m.cashBalance, color: "var(--cat-1)", data: balanceByMonth.map((v) => scaleMoney(v, locale)) }]} />
            ) : (
              <p className="py-6 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-400)" }}>{noCashFlowLong}</p>
            )}
          </Card>
          {snapshotActive ? (
            <Card title={isZh ? "银行借款" : "Bank borrowings"} unit={dict.common.yi}>
              <p className="py-6 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-400)" }}>
                {isZh ? "所选月末的借款合计见上方；按贷款明细（一年内 / 长期）仅提供最新余额。" : "The month-end total is shown above; the per-loan current / long-term split is only available for the latest balances."}
              </p>
            </Card>
          ) : (
          <Card title={isZh ? "银行借款明细" : "Bank borrowings"} unit={dict.common.yi}>
            {debtRows.length === 0 ? (
              <p className="py-6 text-[12.5px]" style={{ color: "var(--ink-400)" }}>{isZh ? "没有识别到贷款类账户" : "No loan-type accounts detected"}</p>
            ) : (
              <table className="w-full text-[12.6px]">
                <thead>
                  <tr className="text-left text-[11px] font-semibold" style={{ color: "var(--ink-400)" }}>
                    <th className="pb-2">{isZh ? "贷款" : "Loan"}</th>
                    <th className="pb-2">{isZh ? "所属主体" : "Owner"}</th>
                    <th className="pb-2 text-right">{isZh ? "一年内到期" : "Current"}</th>
                    <th className="pb-2 text-right">{isZh ? "长期" : "Long-term"}</th>
                    <th className="pb-2 text-right">{isZh ? "合计" : "Total"}</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((l) => (
                    <tr key={l.key} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-2 font-semibold" style={{ color: "var(--ink-900)" }}>{l.base}</td>
                      <td className="py-2" style={{ color: "var(--ink-400)" }}>{l.owner}</td>
                      <td className="tabular-nums py-2 text-right">{fmtM(l.current)}</td>
                      <td className="tabular-nums py-2 text-right">{fmtM(l.longTerm)}</td>
                      <td className="tabular-nums py-2 text-right font-semibold">{fmtM(l.current + l.longTerm + l.unspecified)}</td>
                    </tr>
                  ))}
                  <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 font-bold" colSpan={2}>{isZh ? "合计" : "Total"}</td>
                    <td className="tabular-nums py-2 text-right font-bold">{fmtM(borrowingsCurrent)}</td>
                    <td className="tabular-nums py-2 text-right font-bold">{fmtM(borrowingsLongTerm)}</td>
                    <td className="tabular-nums py-2 text-right font-bold">{fmtM(totalBorrowings)}</td>
                  </tr>
                </tbody>
              </table>
            )}
            <p className="mt-2 text-[11px]" style={{ color: "var(--ink-400)" }}>
              {isZh ? "授信额度（上限）未在系统中记录，因此不显示授信使用率。" : "Credit limits are not tracked, so no utilisation % is shown."}
            </p>
          </Card>
          )}
        </div>

        <Card title={dict.m.cfActivityCard} unit={hasCashFlow ? dict.common.yi : undefined}>
          {hasCashFlow ? (
            <>
              <BarChart
                labels={months}
                height={230}
                series={[
                  { name: dict.m.ocfActivity, color: "var(--cat-3)", data: cashflow.map((c) => scaleMoney(c.ocf, locale)) },
                  { name: dict.m.icfActivity, color: "var(--cat-2)", data: cashflow.map((c) => scaleMoney(Math.abs(c.icf), locale)) },
                  { name: dict.m.fcfActivity, color: "var(--cat-1)", data: cashflow.map((c) => scaleMoney(Math.abs(c.fcf), locale)) },
                ]}
              />
              <div className="mt-3 flex flex-wrap gap-4 text-xs font-medium" style={{ color: "var(--ink-600)" }}>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--cat-3)" }} />{dict.m.ocfActivity}</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--cat-2)" }} />{dict.m.icfActivity} ({isZh ? "绝对值" : "abs"})</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--cat-1)" }} />{dict.m.fcfActivity} ({isZh ? "绝对值" : "abs"})</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--ink-400)" }}>{derivedNote}</p>
            </>
          ) : (
            <p className="py-6 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-400)" }}>{noCashFlowLong}</p>
          )}
        </Card>

        {snapshotActive ? (
          <Card title={isZh ? `月末现金与借款（${periodEndDate(period)}）` : `Month-end cash & borrowings (${periodEndDate(period)})`} unit={dict.common.yi}>
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2">{isZh ? "主体" : "Entity"}</th>
                  <th className="pb-2 text-right">{isZh ? "现金" : "Cash"}</th>
                  <th className="pb-2 text-right">{isZh ? "借款" : "Borrowings"}</th>
                  <th className="pb-2 text-right">{isZh ? "净现金" : "Net cash"}</th>
                </tr>
              </thead>
              <tbody>
                {[...snapshotRows]
                  .sort((x, y) => Number(y.cash) - Number(x.cash))
                  .map((r) => (
                    <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>{r.subsidiary ? localizedName(r.subsidiary, locale) : isZh ? "集团总部" : "Group HQ"}</td>
                      <td className="tabular-nums py-2.5 text-right">{fmtM(Number(r.cash))}</td>
                      <td className="tabular-nums py-2.5 text-right">{fmtM(0 - Number(r.loans))}</td>
                      <td className="tabular-nums py-2.5 text-right font-semibold">{fmtM(Number(r.cash) + Number(r.loans))}</td>
                    </tr>
                  ))}
                <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2.5 font-bold">{isZh ? "合计" : "Total"}</td>
                  <td className="tabular-nums py-2.5 text-right font-bold">{fmtM(cashBalance)}</td>
                  <td className="tabular-nums py-2.5 text-right font-bold">{fmtM(borrowings)}</td>
                  <td className="tabular-nums py-2.5 text-right font-bold">{fmtM(cashBalance - borrowings)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-[11px]" style={{ color: "var(--ink-400)" }}>
              {isZh ? "账户级明细仅提供最新余额；月末数据来自每次 Xero 同步存档的资产负债表。" : "Per-account detail exists for the latest balances only; month-end figures come from the balance sheet archived on each Xero sync."}
            </p>
          </Card>
        ) : (
        <Card title={dict.m.bankTableCard}>
          {missingRateCurrencies.length > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[11.8px]" style={{ background: "color-mix(in srgb, var(--status-warning) 12%, transparent)", color: "var(--status-warning)" }}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {isZh
                ? `以下币种尚未设置汇率，暂按原值计入合计：${missingRateCurrencies.join("、")}。请在「设置 → 货币设置」中补充汇率。`
                : `No exchange rate set for: ${missingRateCurrencies.join(", ")} — included in the total at face value. Add rates under Settings → Currency.`}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2">{dict.m.thBank}</th>
                  <th className="pb-2">{isZh ? "所属主体" : "Owner"}</th>
                  <th className="pb-2">{dict.m.thAcctType}</th>
                  <th className="pb-2">{dict.m.thCcy}</th>
                  <th className="pb-2 text-right">{dict.m.thBalance}</th>
                  <th className="pb-2 text-right">{isZh ? `折合 ${baseCurrency}` : `In ${baseCurrency}`} ({dict.common.yi})</th>
                  <th className="pb-2 text-right">{dict.m.thShare}</th>
                </tr>
              </thead>
              <tbody>
                {bankRows.map((b) => (
                  <tr key={b.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {locale === "en" ? b.bankEn : b.bankZh}
                      {b.kind !== "cash" && (
                        <span className="ml-2 rounded px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ background: "var(--surface-2)", color: "var(--ink-400)" }}>
                          {b.kind === "debt" ? (isZh ? "贷款 · 不计入现金" : "Loan · not cash") : isZh ? "过渡账户 · 已剔除" : "Clearing · excluded"}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5" style={{ color: "var(--ink-400)" }}>
                      {b.subsidiary ? localizedName(b.subsidiary, locale) : isZh ? "集团总部" : "Group HQ"}
                    </td>
                    <td className="py-2.5" style={{ color: "var(--ink-400)" }}>
                      {dict.m[BANK_TYPE_KEY[b.acctType]]}
                    </td>
                    <td className="py-2.5" style={{ color: "var(--ink-400)" }}>
                      {b.currency}
                    </td>
                    <td className="tabular-nums py-2.5 text-right" style={{ color: b.original < 0 ? "var(--status-critical)" : undefined }}>
                      {fmtM(b.original)} {dict.common.yi} {b.currency}
                    </td>
                    <td className="tabular-nums py-2.5 text-right" style={{ color: b.converted < 0 ? "var(--status-critical)" : undefined }}>
                      {fmtM(b.converted)}
                      {!b.hasRate && <span title={isZh ? "无汇率，按原值计入" : "no rate on file, face value used"}> *</span>}
                    </td>
                    <td className="tabular-nums py-2.5 text-right">{b.kind === "cash" ? `${fmt1(totalBank > 0 ? (b.converted / totalBank) * 100 : 0)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        )}
      </div>
    </>
  );
}

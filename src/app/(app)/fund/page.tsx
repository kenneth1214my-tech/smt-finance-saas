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
import BarChart from "@/components/ui/BarChart";

const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const BANK_TYPE_KEY: Record<string, keyof ReturnType<typeof getDictionary>["m"]> = { main: "bankTypeMain", general: "bankTypeGeneral", fx: "bankTypeFx" };

export default async function FundPage(props: PageProps<"/fund">) {
  const user = await requireUser();
  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const searchParams = await props.searchParams;
  const scopeParam = typeof searchParams.scope === "string" ? searchParams.scope : "all";
  const scope: EntityScope = scopeParam === "hq" || scopeParam === "subsidiary" ? scopeParam : "all";
  // null subsidiaryId = Group HQ; "Total" is HQ + every subsidiary.
  const subsidiaryFilter = scope === "hq" ? { subsidiaryId: null } : scope === "subsidiary" ? { subsidiaryId: { not: null } } : {};

  const organizationId = user.organizationId;
  const banks = await db.bankAccount.findMany({ where: { organizationId, ...subsidiaryFilter }, include: { subsidiary: true }, orderBy: { balance: "desc" } });
  const cashflowRows = await db.cashFlowMonthly.findMany({ where: { year: new Date().getFullYear(), organizationId, ...subsidiaryFilter }, orderBy: { month: "asc" } });
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
  const totalOcf = cashflow.reduce((a, c) => a + c.ocf, 0);
  const totalIcf = cashflow.reduce((a, c) => a + c.icf, 0);
  const totalFcf = cashflow.reduce((a, c) => a + c.fcf, 0);

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
    ? "本年度暂无现金流量数据。Xero 没有现金流量表接口，系统无法自动生成经营/投资/筹资活动明细；可通过「设置 → 批量导入 → 月度现金流」导入，导入后此处会自动显示（不再显示为 0）。"
    : "No cash-flow data for this year. Xero has no cash-flow statement endpoint, so operating/investing/financing activity cannot be pulled automatically — import it under Settings → Bulk import → Monthly cash flow and it will appear here (instead of showing 0).";

  return (
    <>
      <Topbar dict={dict} locale={locale} title={dict.nav.fund} desc={dict.nav.fund} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <EntityScopeFilter scope={scope} locale={locale} />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <KpiTile
            icon={Wallet}
            color="var(--cat-1)"
            label={dict.m.cashBalance}
            value={fmtM(totalBank)}
            unit={dict.common.yi}
            note={`${isZh ? `折合 ${baseCurrency}` : `in ${baseCurrency}`}${debtRows.length + excludedClearing.length > 0 ? (isZh ? `，已剔除 ${debtRows.length + excludedClearing.length} 个贷款/过渡账户` : ` · excl. ${debtRows.length + excludedClearing.length} loan/clearing acct`) : ""}`}
          />
          <KpiTile icon={TrendingUp} color="var(--cat-3)" label={dict.m.ocf} value={hasCashFlow ? fmtM(totalOcf) : "—"} unit={hasCashFlow ? dict.common.yi : undefined} note={hasCashFlow ? undefined : noCashFlowShort} />
          <KpiTile icon={TrendingDown} color="var(--cat-2)" label={dict.m.icfNet} value={hasCashFlow ? fmtM(totalIcf) : "—"} unit={hasCashFlow ? dict.common.yi : undefined} note={hasCashFlow ? undefined : noCashFlowShort} />
          <KpiTile icon={Landmark} color="var(--cat-4)" label={dict.m.fcfNet} value={hasCashFlow ? fmtM(totalFcf) : "—"} unit={hasCashFlow ? dict.common.yi : undefined} note={hasCashFlow ? undefined : noCashFlowShort} />
          <KpiTile
            icon={CreditCard}
            color="var(--cat-5)"
            label={isZh ? "银行借款余额" : "Bank Borrowings"}
            value={fmtM(totalBorrowings)}
            unit={dict.common.yi}
            note={isZh ? `一年内 ${fmtM(borrowingsCurrent)} · 长期 ${fmtM(borrowingsLongTerm)}` : `Current ${fmtM(borrowingsCurrent)} · Long-term ${fmtM(borrowingsLongTerm)}`}
          />
          <KpiTile icon={Scale} color="var(--status-warning)" label={isZh ? "净现金（现金 − 借款）" : "Net Cash (cash − borrowings)"} value={fmtM(totalBank - totalBorrowings)} unit={dict.common.yi} />
        </div>

        {probableDuplicates.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-[11.8px]" style={{ background: "color-mix(in srgb, var(--status-warning) 12%, transparent)", color: "var(--status-warning)" }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              {isZh ? "以下银行账户疑似重复录入（同一主体、名称相近），现金余额可能被重复计算，请核对后删除多余的一条：" : "These bank accounts look like duplicates (same entity, near-identical names) — cash may be double-counted. Check and delete the extra row: "}
              {probableDuplicates.map((names) => names.join(" ⇄ ")).join("；")}
            </span>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={dict.m.cashTrendCard} unit={hasCashFlow ? dict.common.yi : undefined}>
            {hasCashFlow ? (
              <TrendChart labels={months} series={[{ name: dict.m.cashBalance, color: "var(--cat-1)", data: balanceByMonth.map((v) => scaleMoney(v, locale)) }]} />
            ) : (
              <p className="py-6 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-400)" }}>{noCashFlowLong}</p>
            )}
          </Card>
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
            </>
          ) : (
            <p className="py-6 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-400)" }}>{noCashFlowLong}</p>
          )}
        </Card>

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
      </div>
    </>
  );
}

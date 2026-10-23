import { Target, TrendingDown, Wallet, TrendingUp } from "lucide-react";
import { requireUser, canApprove } from "@/lib/dal";
import BudgetImport from "@/components/BudgetImport";
import { getCompanyName } from "@/lib/company";
import { db } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney, scaleMoney } from "@/lib/i18n/dictionaries";
import { localizedName } from "@/lib/localize";
import { getBaseCurrency, getFyeMonth } from "@/lib/currency";
import { fiscalFindMany } from "@/lib/fiscal";
import { parsePeriod, periodLabel } from "@/lib/period";
import { getReportYears } from "@/lib/period-server";
import PeriodSelector from "@/components/PeriodSelector";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import Ring from "@/components/ui/Ring";
import BarChart from "@/components/ui/BarChart";

const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

type Monthly = Awaited<ReturnType<typeof db.monthlyFinancial.findMany>>[number];

export default async function BudgetPage(props: PageProps<"/budget">) {
  const user = await requireUser();
  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const organizationId = user.organizationId;
  const fye = await getFyeMonth(organizationId); // month the financial year ends in (12 = calendar year)
  const period = parsePeriod(await props.searchParams, new Date(), fye);
  const baseCurrency = await getBaseCurrency(organizationId);
  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);
  const fmtM = (n: number) => fmtMoney(n, locale);
  const reportYears = await getReportYears(organizationId, period.year, fye);
  const isFull = period.fromMonth === 1 && period.toMonth === 12;
  const periodMonths = period.toMonth - period.fromMonth + 1;
  const subsidiaries = await db.subsidiary.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } });
  const budgets = await db.budget.findMany({ where: { year: period.year, organizationId }, include: { subsidiary: true } });
  const loadYear = async (year: number): Promise<Monthly[]> => (await fiscalFindMany(db.monthlyFinancial, fye, { where: { year, organizationId } })) as Monthly[];
  const yearRows = await loadYear(period.year);
  const priorYearRows = await loadYear(period.year - 1);

  const hqLabel = await getCompanyName(organizationId);
  const subOrHqName = (sub: { nameZh: string; nameZhTw: string; nameEn: string; nameMs: string; nameId: string } | null) =>
    sub ? localizedName(sub, locale) : isZh ? "集团总部" : "Group HQ";

  const inPeriod = (m: Monthly) => m.month >= period.fromMonth && m.month <= period.toMonth;
  const totals = (rowsIn: Monthly[]) => ({
    revenue: rowsIn.reduce((a, m) => a + Number(m.revenue), 0),
    cost: rowsIn.reduce((a, m) => a + Number(m.opCost), 0),
    expense: rowsIn.reduce((a, m) => a + Number(m.sellExp) + Number(m.adminExp) + Number(m.rndExp) + Number(m.financeExp), 0),
  });

  // Every entity gets a row. Where no annual budget exists (none in the ledger, none entered), an automatic baseline is used:
  // last year's full-year actuals, spread evenly over the twelve months (a month-by-month copy would be thrown off by one-off months, such as a
  // new subsidiary's first big month) — so the page never sits empty, and a real budget replaces it the moment one is synced or imported.
  const entities: { sub: (typeof subsidiaries)[number] | null }[] = [{ sub: null }, ...subsidiaries.map((s) => ({ sub: s }))];
  const rows = entities.map(({ sub }) => {
    const subId = sub?.id ?? null;
    const b = budgets.find((x) => x.subsidiaryId === subId);
    const mine = yearRows.filter((m) => m.subsidiaryId === subId && inPeriod(m));
    const latest = mine.length ? Math.max(...mine.map((m) => m.month)) : 0;
    const elapsed = latest ? latest - period.fromMonth + 1 : 0; // months of the period that have actuals
    const prevAll = priorYearRows.filter((m) => m.subsidiaryId === subId);
    const now = totals(mine);

    const annual = b ? Number(b.revenueBudget) : 0;
    let budget: number; // target for the whole selected period
    let budgetElapsed: number; // target for the months that already have actuals
    let budgetCost: number;
    let budgetExp: number;
    let auto = false;
    if (annual > 0) {
      budget = (annual * periodMonths) / 12;
      budgetElapsed = (annual * elapsed) / 12;
      budgetCost = budgetElapsed * (Number(b!.costBudgetRate) / 100);
      budgetExp = budgetElapsed * (Number(b!.expenseBudgetRate) / 100);
    } else if (totals(prevAll).revenue > 0) {
      // Automatic baseline: last year's full-year actuals, spread evenly over twelve months like a real annual budget.
      auto = true;
      const py = totals(prevAll);
      budget = (py.revenue * periodMonths) / 12;
      budgetElapsed = (py.revenue * elapsed) / 12;
      budgetCost = budgetElapsed * (py.cost / py.revenue);
      budgetExp = budgetElapsed * (py.expense / py.revenue);
    } else {
      budget = 0;
      budgetElapsed = 0;
      budgetCost = 0;
      budgetExp = 0;
    }
    const actual = now.revenue;
    const rate = budget > 0 ? (actual / budget) * 100 : 0;
    const variance = actual - budgetElapsed;
    return { sub, budget, actual, rate, variance, auto, actualCost: now.cost, actualExp: now.expense, budgetCost, budgetExp };
  });

  const totalActual = rows.reduce((a, r) => a + r.actual, 0);
  const totalBudget = rows.reduce((a, r) => a + r.budget, 0);
  const revBudgetRate = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
  // Only entities that actually have a budget count — an entity with none is "not budgeted", not "0%".
  const budgeted = rows.filter((r) => r.budget > 0);
  const hasBudget = budgeted.length > 0;
  const anyAuto = budgeted.some((r) => r.auto);
  const allAuto = hasBudget && budgeted.every((r) => r.auto);
  // Execution = what was actually spent ÷ the budget for the months elapsed (budget revenue × the budgeted cost / expense ratio).
  const sumOf = (pick: (r: (typeof rows)[number]) => number) => budgeted.reduce((a, r) => a + pick(r), 0);
  const costExec = hasBudget && sumOf((r) => r.budgetCost) > 0 ? (sumOf((r) => r.actualCost) / sumOf((r) => r.budgetCost)) * 100 : null;
  const expExec = hasBudget && sumOf((r) => r.budgetExp) > 0 ? (sumOf((r) => r.actualExp) / sumOf((r) => r.budgetExp)) * 100 : null;
  const noBudgetNote = isZh ? "未设置年度预算 — 在 Xero 建立预算后将自动同步" : "No annual budget set — it syncs automatically once one is created in Xero";
  const autoNote = isZh ? "自动基准：以去年全年实际数平均分摊到各月作为预算（账中尚无年度预算）" : "Automatic baseline: last year's full-year actuals spread evenly over the months (no annual budget on file)";
  // Full-year forecast = the pace of the whole financial year so far, independent of the period picked above.
  const yearMonthCount = yearRows.length ? Math.max(...yearRows.map((m) => m.month)) : 0;
  const forecast = yearMonthCount > 0 ? (totals(yearRows).revenue / yearMonthCount) * 12 : 0;
  const targetWord = isFull ? (isZh ? "年度目标" : "Annual target") : isZh ? "期间目标" : "Period target";

  return (
    <>
      <Topbar dict={dict} locale={locale} title={dict.nav.budget} desc={dict.nav.budget} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        {canApprove(user.role) && (
          <BudgetImport
            isZh={isZh}
            defaultYear={period.year}
            hasXeroBudget={budgets.some((b) => Number(b.revenueBudget) > 0)}
            entities={[
              { key: "", label: hqLabel, names: [hqLabel, "Group HQ", "集团总部", "HQ"] },
              ...subsidiaries.map((s) => ({ key: s.key, label: localizedName(s, locale), names: [s.nameEn, s.nameZh, s.nameZhTw, s.nameMs, s.nameId] })),
            ]}
          />
        )}
        <div className="flex flex-wrap items-center justify-between gap-3" data-pdf-hide>
          <PeriodSelector year={period.year} fromMonth={period.fromMonth} toMonth={period.toMonth} years={reportYears} isZh={isZh} fyeMonth={fye} />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiTile icon={Target} color="var(--cat-1)" label={dict.m.revBudgetRate} value={hasBudget ? fmt1(revBudgetRate) : "—"} unit={hasBudget ? "%" : undefined} note={hasBudget ? `${targetWord} ${fmtM(totalBudget)} ${dict.common.yi}${anyAuto ? ` · ${allAuto ? autoNote : isZh ? "部分主体使用去年实际数作基准" : "some entities use last year's actuals as the baseline"}` : ""}` : noBudgetNote} />
          <KpiTile icon={TrendingDown} color="var(--cat-2)" label={dict.m.costBudgetRate} value={costExec === null ? "—" : fmt1(costExec)} unit={costExec === null ? undefined : "%"} note={costExec === null ? undefined : isZh ? "实际成本 ÷ 已过月份的成本预算" : "Actual cost ÷ cost budget for the months elapsed"} />
          <KpiTile icon={Wallet} color="var(--cat-4)" label={dict.m.expBudgetRate} value={expExec === null ? "—" : fmt1(expExec)} unit={expExec === null ? undefined : "%"} note={expExec === null ? undefined : isZh ? "实际费用 ÷ 已过月份的费用预算" : "Actual expenses ÷ expense budget for the months elapsed"} />
          <KpiTile icon={TrendingUp} color="var(--status-good)" label={dict.m.revForecast} value={fmtM(forecast)} unit={dict.common.yi} />
        </div>

        <Card title={dict.m.budgetVsActualCard} unit={dict.common.yi}>
          <BarChart
            labels={rows.map((r) => subOrHqName(r.sub))}
            height={260}
            series={[
              { name: dict.m.budgetLabel, color: "var(--surface-2)", data: rows.map((r) => scaleMoney(r.budget, locale)) },
              { name: dict.m.actualLabel, color: "var(--cat-1)", data: rows.map((r) => scaleMoney(r.actual, locale)) },
            ]}
          />
          <div className="mt-3 flex gap-4 text-xs font-medium" style={{ color: "var(--ink-600)" }}>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border" style={{ background: "var(--surface-2)", borderColor: "var(--border-strong)" }} />
              {dict.m.budgetLabel}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--cat-1)" }} />
              {dict.m.actualLabel}
            </span>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={dict.m.budgetRateCard}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {rows.map((r) => {
                const color = r.rate >= 95 ? "var(--status-good)" : r.rate >= 80 ? "var(--cat-1)" : "var(--status-warning)";
                return (
                  <div key={r.sub?.id ?? "hq"} className="flex flex-col items-center gap-2 text-center">
                    {r.budget > 0 ? (
                      <Ring pct={r.rate} color={color} size={84} />
                    ) : (
                      <div className="flex items-center justify-center text-[18px] font-extrabold" style={{ width: 84, height: 84, color: "var(--ink-400)" }}>
                        —
                      </div>
                    )}
                    <div className="text-[12px] font-semibold" style={{ color: "var(--ink-900)" }}>
                      {subOrHqName(r.sub)}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card title={dict.m.budgetNoteCard}>
            <div className="space-y-2 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-600)" }}>
              <p>
                {isZh
                  ? "· 完成率 ≥95% 视为达标（绿色）"
                  : "· Achievement ≥95% is on target (green)"}
              </p>
              <p>{isZh ? "· 80%~95% 为正常波动区间（蓝色）" : "· 80%–95% is within normal range (blue)"}</p>
              <p>{isZh ? "· <80% 需关注差异原因并跟踪整改（黄色）" : "· <80% needs review and follow-up (amber)"}</p>
              <p>
                {isZh
                  ? `· 期间：${periodLabel(period, isZh, fye)}。实际数取该期间已录入的月份；整年预算按 12 个月平均分摊，自动基准则以去年全年实际数同样平均分摊`
                  : `· Period: ${periodLabel(period, isZh, fye)}. Actuals are the months on file within it; an annual budget is spread evenly over twelve months, an automatic baseline is last year's full-year actuals spread the same way`}
              </p>
            </div>
          </Card>
        </div>

        <Card title={dict.m.budgetDetailCard} unit={dict.common.yi}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2">{dict.m.thItemSub}</th>
                  <th className="pb-2 text-right">{isFull ? dict.m.thAnnualBudget : isZh ? "期间预算" : "Period budget"}</th>
                  <th className="pb-2 text-right">{dict.m.thCumActual}</th>
                  <th className="pb-2 text-right">{dict.m.thVariance}</th>
                  <th className="pb-2 text-right">{dict.m.thRate}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sub?.id ?? "hq"} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {subOrHqName(r.sub)}
                    </td>
                    <td className="tabular-nums py-2.5 text-right">
                      {r.budget > 0 ? fmtM(r.budget) : "—"}
                      {r.auto && (
                        <span className="ml-1 text-[10.5px] font-semibold" style={{ color: "var(--ink-400)" }} title={autoNote}>
                          ({isZh ? "自动" : "auto"})
                        </span>
                      )}
                    </td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(r.actual)}</td>
                    <td className="tabular-nums py-2.5 text-right font-bold" style={{ color: r.budget <= 0 ? "var(--ink-400)" : r.variance >= 0 ? "var(--delta-up)" : "var(--delta-down)" }}>
                      {r.budget > 0 ? `${r.variance >= 0 ? "+" : ""}${fmtM(r.variance)}` : "—"}
                    </td>
                    <td className="tabular-nums py-2.5 text-right">{r.budget > 0 ? `${fmt1(r.rate)}%` : "—"}</td>
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

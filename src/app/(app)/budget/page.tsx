import { Target, TrendingDown, Wallet, TrendingUp } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney, scaleMoney } from "@/lib/i18n/dictionaries";
import { localizedName } from "@/lib/localize";
import { getBaseCurrency } from "@/lib/currency";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import Ring from "@/components/ui/Ring";
import BarChart from "@/components/ui/BarChart";

const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default async function BudgetPage() {
  const user = await requireUser();
  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";

  const organizationId = user.organizationId;
  const baseCurrency = await getBaseCurrency(organizationId);
  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);
  const fmtM = (n: number) => fmtMoney(n, locale);
  const currentYear = new Date().getFullYear();
  const budgets = await db.budget.findMany({ where: { year: currentYear, organizationId }, include: { subsidiary: true }, orderBy: { subsidiary: { sortOrder: "asc" } } });
  const monthly = await db.monthlyFinancial.findMany({ where: { year: currentYear, organizationId } });
  // Per-entity, not a single count shared across the whole org — entities don't necessarily have
  // data entered through the same month (a newly onboarded subsidiary, or one whose sync lagged,
  // would otherwise get pro-rated against months of budget it was never expected to have hit yet).
  const monthCountFor = (subsidiaryId: string | null) => {
    const rows = monthly.filter((m) => m.subsidiaryId === subsidiaryId);
    return rows.length ? Math.max(...rows.map((m) => m.month)) : 0;
  };
  const orgMonthCount = monthly.length ? Math.max(...monthly.map((m) => m.month)) : 0;

  const subOrHqName = (sub: { nameZh: string; nameZhTw: string; nameEn: string; nameMs: string; nameId: string } | null) =>
    sub ? localizedName(sub, locale) : isZh ? "集团总部" : "Group HQ";

  const rows = budgets.map((b) => {
    const actual = monthly.filter((m) => m.subsidiaryId === b.subsidiaryId).reduce((a, r) => a + Number(r.revenue), 0);
    const budget = Number(b.revenueBudget);
    const rate = budget > 0 ? (actual / budget) * 100 : 0;
    const proRatedBudget = budget * (monthCountFor(b.subsidiaryId) / 12);
    const variance = actual - proRatedBudget;
    return { sub: b.subsidiary, budget, actual, rate, variance, costRate: Number(b.costBudgetRate), expRate: Number(b.expenseBudgetRate) };
  });

  const totalActual = rows.reduce((a, r) => a + r.actual, 0);
  const totalBudget = rows.reduce((a, r) => a + r.budget, 0);
  const revBudgetRate = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;
  // Only entities that actually have a budget count — an entity with none is "not budgeted", not "0%".
  const budgeted = rows.filter((r) => r.budget > 0);
  const hasBudget = budgeted.length > 0;
  const avgCostRate = hasBudget ? budgeted.reduce((a, r) => a + r.costRate, 0) / budgeted.length : 0;
  const avgExpRate = hasBudget ? budgeted.reduce((a, r) => a + r.expRate, 0) / budgeted.length : 0;
  const noBudgetNote = isZh ? "未设置年度预算 — 在 Xero 建立预算后将自动同步" : "No annual budget set — it syncs automatically once one is created in Xero";
  const forecast = orgMonthCount > 0 ? (totalActual / orgMonthCount) * 12 : 0;

  return (
    <>
      <Topbar dict={dict} locale={locale} title={dict.nav.budget} desc={dict.nav.budget} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiTile icon={Target} color="var(--cat-1)" label={dict.m.revBudgetRate} value={hasBudget ? fmt1(revBudgetRate) : "—"} unit={hasBudget ? "%" : undefined} note={hasBudget ? `${isZh ? "年度目标" : "Annual target"} ${fmtM(totalBudget)} ${dict.common.yi}` : noBudgetNote} />
          <KpiTile icon={TrendingDown} color="var(--cat-2)" label={dict.m.costBudgetRate} value={hasBudget ? fmt1(avgCostRate) : "—"} unit={hasBudget ? "%" : undefined} />
          <KpiTile icon={Wallet} color="var(--cat-4)" label={dict.m.expBudgetRate} value={hasBudget ? fmt1(avgExpRate) : "—"} unit={hasBudget ? "%" : undefined} />
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
                {orgMonthCount > 0
                  ? isZh
                    ? `· 每个主体按其自身最新已录入月份折算年度预算比较（集团整体口径为 1-${orgMonthCount} 月累计）`
                    : `· Each entity's budget is pro-rated against its own latest month on file (group total shown is Jan–month ${orgMonthCount})`
                  : isZh
                    ? "· 暂无月度实际数据，进度按 0 计算"
                    : "· No monthly actuals entered yet — progress shows as 0"}
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
                  <th className="pb-2 text-right">{dict.m.thAnnualBudget}</th>
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
                    <td className="tabular-nums py-2.5 text-right">{r.budget > 0 ? fmtM(r.budget) : "—"}</td>
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

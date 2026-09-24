import { Percent, TrendingUp, DollarSign, PieChart, Users2, Wallet } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney } from "@/lib/i18n/dictionaries";
import { localizedName, monthLabels } from "@/lib/localize";
import { getBaseCurrency } from "@/lib/currency";
import { effectiveRiskRating } from "@/lib/risk-rating";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import RankList from "@/components/ui/RankList";
import TrendChart from "@/components/ui/TrendChart";
import StatusPill from "@/components/ui/StatusPill";

const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const RISK_TONE: Record<string, "good" | "warning" | "serious" | "critical"> = { GOOD: "good", WARNING: "warning", SERIOUS: "serious", CRITICAL: "critical" };

export default async function ProfitPage() {
  const user = await requireUser();
  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";

  const organizationId = user.organizationId;
  const baseCurrency = await getBaseCurrency(organizationId);
  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);
  const fmtM = (n: number) => fmtMoney(n, locale);
  const subsidiaries = await db.subsidiary.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } });
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const currentYear = new Date().getFullYear();
  const monthly = await db.monthlyFinancial.findMany({ where: { year: currentYear, organizationId }, orderBy: { month: "asc" } });
  // Prior-year revenue, fetched only to compute YoY for risk-rating escalation below — this
  // page's own KPIs/trends stay current-year-only.
  const prevYearMonthly = await db.monthlyFinancial.findMany({ where: { year: currentYear - 1, organizationId } });

  const totalRevenue = monthly.reduce((a, r) => a + Number(r.revenue), 0);
  const totalCost = monthly.reduce((a, r) => a + Number(r.opCost), 0);
  const totalNetProfit = monthly.reduce((a, r) => a + Number(r.netProfit), 0);
  const grossProfit = totalRevenue - totalCost;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  // Real period expenses (below the gross-profit line), summed from the same fields 经营分析
  // uses — previously this multiplied revenue by a hardcoded 18.7% ("estimated"), a leftover
  // from before sellExp/adminExp/rndExp/financeExp existed as real entered/synced figures.
  const periodExpenses = monthly.reduce((a, r) => a + Number(r.sellExp) + Number(r.adminExp) + Number(r.rndExp) + Number(r.financeExp), 0);
  const opProfit = grossProfit - periodExpenses;
  const opMargin = totalRevenue > 0 ? (opProfit / totalRevenue) * 100 : 0;
  const netMargin = totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0;

  const monthCount = monthly.length ? Math.max(...monthly.map((m) => m.month)) : 0;
  const months = monthLabels(locale, monthCount);
  const gmByMonth = Array.from({ length: monthCount }, (_, i) => {
    const rows = monthly.filter((r) => r.month === i + 1);
    const rev = rows.reduce((a, r) => a + Number(r.revenue), 0);
    const cost = rows.reduce((a, r) => a + Number(r.opCost), 0);
    return rev > 0 ? ((rev - cost) / rev) * 100 : 0;
  });
  const nmByMonth = Array.from({ length: monthCount }, (_, i) => {
    const rows = monthly.filter((r) => r.month === i + 1);
    const rev = rows.reduce((a, r) => a + Number(r.revenue), 0);
    const np = rows.reduce((a, r) => a + Number(r.netProfit), 0);
    return rev > 0 ? (np / rev) * 100 : 0;
  });

  // A pseudo-entity standing in for the group/HQ-level bucket (subsidiaryId === null) in the
  // breakdown views below — otherwise HQ's contribution vanishes from every chart even though
  // it's still fully counted in totalRevenue/totalNetProfit above via the org-wide `monthly`
  // array, so a large HQ import could move the KPI tiles with no visible explanation anywhere.
  const HQ_PSEUDO_SUB = {
    id: "__hq__",
    colorHex: "#64748b",
    nameZh: "集团总部",
    nameZhTw: "集團總部",
    nameEn: "Group HQ",
    nameMs: "Group HQ",
    nameId: "Group HQ",
    riskRating: "GOOD" as const,
  };
  const hqRows = monthly.filter((m) => !m.subsidiaryId);
  const hqRevenue = hqRows.reduce((a, r) => a + Number(r.revenue), 0);
  const hqNetProfit = hqRows.reduce((a, r) => a + Number(r.netProfit), 0);
  const hqPrevRevenue = prevYearMonthly.filter((m) => !m.subsidiaryId).reduce((a, r) => a + Number(r.revenue), 0);

  function subRow(sub: (typeof subsidiaries)[number] | typeof HQ_PSEUDO_SUB, revenue: number, netProfit: number, equity: number, prevRevenue: number) {
    // ROE = net profit ÷ equity, computed from real data rather than hand-typed — see 组织架构管理
    // where equity is entered. null (not 0) when there's no real equity on file — a "0.0%" reads
    // as a genuine flat ROE, not "we don't actually know this entity's equity".
    const roe = equity > 0 ? (netProfit / equity) * 100 : null;
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    // null (not 0) when there's no real prior-year figure to compare against.
    const yoy = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;
    // yoy ?? 0: escalation only ever triggers on negative growth, so a missing baseline can't
    // fake a decline — but margin still escalates a genuinely loss-making entity regardless of
    // whether a prior-year comparison exists yet (see risk-rating.ts). Uses a separate signal
    // from the DISPLAYED netMargin: with zero revenue netMargin is genuinely undefined and shown
    // as 0%, but a real net loss with no revenue to show for it is still a real loss.
    const marginForRisk = revenue > 0 ? netMargin : netProfit < 0 ? -100 : 0;
    const effRisk = effectiveRiskRating(sub.riskRating, yoy ?? 0, marginForRisk);
    return { sub, revenue, netProfit, netMargin, roe, yoy, effRisk };
  }
  const bySub = [
    ...subsidiaries.map((s) => {
      const rows = monthly.filter((m) => m.subsidiaryId === s.id);
      const prevRows = prevYearMonthly.filter((m) => m.subsidiaryId === s.id);
      return subRow(s, rows.reduce((a, r) => a + Number(r.revenue), 0), rows.reduce((a, r) => a + Number(r.netProfit), 0), Number(s.equity), prevRows.reduce((a, r) => a + Number(r.revenue), 0));
    }),
    // Only shown when there's actually HQ-level data on file — don't clutter the table with an empty row.
    ...(hqRevenue !== 0 || hqNetProfit !== 0 ? [subRow(HQ_PSEUDO_SUB, hqRevenue, hqNetProfit, Number(organization.equity), hqPrevRevenue)] : []),
  ];
  // Average across entities that actually HAVE equity on file — including a null (no-data) ROE
  // as 0 would silently drag the average toward "healthy" for entities we know nothing about.
  const roeRows = bySub.filter((r): r is typeof bySub[number] & { roe: number } => r.roe !== null);
  const avgRoe = roeRows.length ? roeRows.reduce((a, r) => a + r.roe, 0) / roeRows.length : 0;

  const waterfall = [
    { label: dict.m.revenue, value: totalRevenue, kind: "total" as const },
    { label: dict.m.cost, value: -totalCost, kind: "neg" as const },
    { label: locale === "zh" || locale === "zh-Hant" ? "毛利" : "Gross Profit", value: grossProfit, kind: "sub" as const },
    {
      label: locale === "zh" || locale === "zh-Hant" ? "期间费用" : "Period Expenses",
      value: -periodExpenses,
      kind: "neg" as const,
    },
    { label: dict.m.opProfit, value: opProfit, kind: "total" as const },
  ];
  const maxAbs = Math.max(...waterfall.map((w) => Math.abs(w.value)), totalRevenue);

  return (
    <>
      <Topbar dict={dict} locale={locale} title={dict.nav.profit} desc={dict.nav.profit} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <KpiTile icon={Percent} color="var(--cat-1)" label={dict.m.grossMargin} value={fmt1(grossMargin)} unit="%" />
          <KpiTile icon={TrendingUp} color="var(--cat-2)" label={dict.m.opMargin} value={fmt1(opMargin)} unit="%" />
          <KpiTile icon={DollarSign} color="var(--status-good)" label={dict.m.netMargin} value={fmt1(netMargin)} unit="%" />
          <KpiTile icon={Wallet} color="var(--cat-4)" label={dict.m.netProfit} value={fmtM(totalNetProfit)} unit={dict.common.yi} />
          <KpiTile icon={PieChart} color="var(--cat-5)" label={dict.m.opProfit} value={fmtM(opProfit)} unit={dict.common.yi} />
          <KpiTile icon={Users2} color="var(--cat-3)" label={dict.m.avgRoe} value={fmt1(avgRoe)} unit="%" />
        </div>

        <Card title={dict.m.waterfallCard} unit={dict.common.yi}>
          <div className="flex items-end gap-2 overflow-x-auto pb-1 pt-4">
            {waterfall.map((w, i) => {
              const h = maxAbs > 0 ? (Math.abs(w.value) / maxAbs) * 160 : 0;
              const color = w.kind === "total" ? "var(--cat-1)" : w.kind === "sub" ? "var(--cat-4)" : w.value < 0 ? "var(--delta-down)" : "var(--delta-up)";
              return (
                <div key={i} className="flex min-w-[92px] flex-1 flex-col items-center">
                  <div className="tabular-nums mb-1.5 text-[12.5px] font-bold" style={{ color: "var(--ink-900)" }}>
                    {w.value >= 0 && w.kind === "neg" ? "" : w.value >= 0 ? "+" : ""}
                    {fmtM(w.value)}
                  </div>
                  <div className="flex h-[160px] w-full items-end justify-center">
                    <div className="w-[60%] rounded-t-md" style={{ height: `${Math.max(h, 3)}px`, background: color }} />
                  </div>
                  <div className="mt-2 text-center text-[11.5px] font-semibold" style={{ color: "var(--ink-600)" }}>
                    {w.label}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={dict.m.marginTrendCard} unit="%">
            <TrendChart
              labels={months}
              suffix="%"
              series={[
                { name: dict.m.grossMargin, color: "var(--cat-1)", data: gmByMonth },
                { name: dict.m.netMargin, color: "var(--cat-4)", data: nmByMonth },
              ]}
            />
            <div className="mt-3 flex gap-4 text-xs font-medium" style={{ color: "var(--ink-600)" }}>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--cat-1)" }} />
                {dict.m.grossMargin}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--cat-4)" }} />
                {dict.m.netMargin}
              </span>
            </div>
          </Card>
          <Card title={dict.m.profitContribCard} unit={dict.common.yi}>
            <RankList
              items={bySub
                .slice()
                .sort((a, b) => b.netProfit - a.netProfit)
                .map((r) => ({ id: r.sub.id, label: localizedName(r.sub, locale), value: r.netProfit, color: r.sub.colorHex }))}
              valueFmt={fmtM}
            />
          </Card>
        </div>

        <Card title={dict.m.profitabilityCard}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2">{dict.m.thSubsidiary}</th>
                  <th className="pb-2 text-right">{dict.m.revenue}</th>
                  <th className="pb-2 text-right">{dict.m.netProfit}</th>
                  <th className="pb-2 text-right">{dict.m.netMargin}</th>
                  <th className="pb-2 text-right">{dict.m.roe}</th>
                  <th className="pb-2">{dict.m.riskRating}</th>
                </tr>
              </thead>
              <tbody>
                {bySub.map((r) => (
                  <tr key={r.sub.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {localizedName(r.sub, locale)}
                    </td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(r.revenue)}</td>
                    <td className="tabular-nums py-2.5 text-right" style={{ color: r.netProfit < 0 ? "var(--status-critical)" : undefined }}>
                      {fmtM(r.netProfit)}
                    </td>
                    <td className="tabular-nums py-2.5 text-right" style={{ color: r.netMargin < 0 ? "var(--status-critical)" : undefined }}>
                      {fmt1(r.netMargin)}%
                    </td>
                    <td className="tabular-nums py-2.5 text-right" style={{ color: r.roe === null ? "var(--ink-400)" : r.roe < 0 ? "var(--status-critical)" : undefined }}>
                      {r.roe === null ? (isZh ? "无数据" : "N/A") : `${fmt1(r.roe)}%`}
                    </td>
                    <td className="py-2.5">
                      <StatusPill
                        tone={RISK_TONE[r.effRisk]}
                        label={
                          r.effRisk === "GOOD"
                            ? dict.m.riskGood
                            : r.effRisk === "WARNING"
                              ? dict.m.riskWarning
                              : r.effRisk === "SERIOUS"
                                ? dict.m.riskSerious
                                : dict.m.riskCritical
                        }
                      />
                    </td>
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

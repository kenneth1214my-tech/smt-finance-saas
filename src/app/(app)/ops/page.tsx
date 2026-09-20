import { TrendingUp, DollarSign, Percent, Wallet, FlaskConical, Users2 } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney } from "@/lib/i18n/dictionaries";
import { localizedSegment, monthLabels } from "@/lib/localize";
import { getBaseCurrency } from "@/lib/currency";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import RankList from "@/components/ui/RankList";
import TrendChart from "@/components/ui/TrendChart";

const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default async function OpsPage() {
  const user = await requireUser();
  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";

  const organizationId = user.organizationId;
  const baseCurrency = await getBaseCurrency(organizationId);
  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);
  const fmtM = (n: number) => fmtMoney(n, locale);
  const subsidiaries = await db.subsidiary.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } });
  const monthly = await db.monthlyFinancial.findMany({ where: { year: { in: [2025, 2026] }, organizationId }, orderBy: { month: "asc" } });
  const m2026 = monthly.filter((m) => m.year === 2026);
  const m2025 = monthly.filter((m) => m.year === 2025);

  // A pseudo-entity standing in for the group/HQ-level bucket (subsidiaryId === null) in the
  // breakdown views below. Previously this page's KPI totals (revenue, cost, expense ratio,
  // revenue-per-head) were computed by summing bySub, which only ever iterated `subsidiaries` —
  // so HQ-level data was silently excluded from the totals themselves, not just the breakdown,
  // unlike 集团总览/利润分析 which sum the org-wide monthly rows directly.
  const HQ_PSEUDO_SUB = { id: "__hq__", colorHex: "#64748b", segmentZh: "集团总部", segmentZhTw: "集團總部", segmentEn: "Group HQ", segmentMs: "Group HQ", segmentId: "Group HQ" };

  function subRow(sub: (typeof subsidiaries)[number] | typeof HQ_PSEUDO_SUB, cur: typeof m2026, prev: typeof m2025) {
    const revenue = cur.reduce((a, r) => a + Number(r.revenue), 0);
    const cost = cur.reduce((a, r) => a + Number(r.opCost), 0);
    const sellExp = cur.reduce((a, r) => a + Number(r.sellExp), 0);
    const adminExp = cur.reduce((a, r) => a + Number(r.adminExp), 0);
    const rndExp = cur.reduce((a, r) => a + Number(r.rndExp), 0);
    const financeExp = cur.reduce((a, r) => a + Number(r.financeExp), 0);
    // Headcount is a point-in-time snapshot, not additive across months — take the latest
    // month on file for this subsidiary rather than summing.
    const latestMonth = cur.length ? Math.max(...cur.map((m) => m.month)) : 0;
    const headcount = cur.find((m) => m.month === latestMonth)?.headcount ?? 0;
    const prevRevenue = prev.reduce((a, r) => a + Number(r.revenue), 0);
    // null (not 0) when there's no real prior-year figure to compare against — a genuinely new
    // entity (e.g. HQ's first-ever import) showing "+0.0% growth" would misreport "flat" when
    // the truth is "no baseline exists yet".
    const yoy = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;
    return { sub, revenue, cost, sellExp, adminExp, rndExp, financeExp, headcount, margin: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0, yoy };
  }

  const hqCur = m2026.filter((m) => !m.subsidiaryId);
  const hqPrev = m2025.filter((m) => !m.subsidiaryId);
  const bySub = [
    ...subsidiaries.map((s) => subRow(s, m2026.filter((m) => m.subsidiaryId === s.id), m2025.filter((m) => m.subsidiaryId === s.id))),
    // Only shown when there's actually HQ-level data on file — don't clutter the breakdown with an empty row.
    ...(hqCur.length || hqPrev.length ? [subRow(HQ_PSEUDO_SUB, hqCur, hqPrev)] : []),
  ];

  const totalRevenue = bySub.reduce((a, b) => a + b.revenue, 0);
  const totalCost = bySub.reduce((a, b) => a + b.cost, 0);
  const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
  const sellExp = bySub.reduce((a, b) => a + b.sellExp, 0);
  const adminExp = bySub.reduce((a, b) => a + b.adminExp, 0);
  const rndExp = bySub.reduce((a, b) => a + b.rndExp, 0);
  const financeExp = bySub.reduce((a, b) => a + b.financeExp, 0);
  const totalHeadcount = bySub.reduce((a, b) => a + b.headcount, 0);
  const expenseRatio = totalRevenue > 0 ? ((sellExp + adminExp + rndExp + financeExp) / totalRevenue) * 100 : 0;
  const revenuePerHead = totalHeadcount > 0 ? totalRevenue / totalHeadcount : 0;

  const monthCount = m2026.length ? Math.max(...m2026.map((m) => m.month)) : 0;
  const months = monthLabels(locale, monthCount);
  const opCostRatioByMonth = Array.from({ length: monthCount }, (_, i) => {
    const rows = m2026.filter((r) => r.month === i + 1);
    const rev = rows.reduce((a, r) => a + Number(r.revenue), 0);
    const cost = rows.reduce((a, r) => a + Number(r.opCost), 0);
    return rev > 0 ? (cost / rev) * 100 : 0;
  });

  const costRows = [
    { name: dict.m.cost, value: totalCost, color: "var(--cat-1)" },
    { name: dict.m.sellExp, value: sellExp, color: "var(--cat-2)" },
    { name: dict.m.adminExp, value: adminExp, color: "var(--cat-4)" },
    { name: dict.m.rndExp, value: rndExp, color: "var(--cat-5)" },
    { name: dict.m.financeExp, value: financeExp, color: "var(--cat-3)" },
  ];

  const opCostTrendTitle = locale === "zh" || locale === "zh-Hant" ? "月度营业成本占比趋势" : "Monthly Operating Cost Ratio Trend";

  return (
    <>
      <Topbar dict={dict} locale={locale} title={dict.nav.ops} desc={dict.nav.ops} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <KpiTile icon={TrendingUp} color="var(--cat-1)" label={dict.m.revenue} value={fmtM(totalRevenue)} unit={dict.common.yi} />
          <KpiTile icon={DollarSign} color="var(--cat-2)" label={dict.m.cost} value={fmtM(totalCost)} unit={dict.common.yi} />
          <KpiTile icon={Percent} color="var(--status-good)" label={dict.m.grossMargin} value={fmt1(grossMargin)} unit="%" />
          <KpiTile icon={Wallet} color="var(--cat-4)" label={dict.m.expenseRatio} value={fmt1(expenseRatio)} unit="%" />
          <KpiTile icon={FlaskConical} color="var(--cat-5)" label={dict.m.rndIntensity} value={fmt1(totalRevenue > 0 ? (rndExp / totalRevenue) * 100 : 0)} unit="%" />
          <KpiTile icon={Users2} color="var(--cat-3)" label={dict.m.revenuePerHead} value={fmtM(revenuePerHead)} unit={dict.common.yi} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={dict.m.revByLineCard} unit={dict.common.yi}>
            <RankList
              items={bySub
                .slice()
                .sort((a, b) => b.revenue - a.revenue)
                .map((r) => ({ id: r.sub.id, label: localizedSegment(r.sub, locale), value: r.revenue, color: r.sub.colorHex }))}
              valueFmt={fmtM}
            />
          </Card>
          <Card title={dict.m.growthByLineCard} unit="%">
            <div className="flex flex-col gap-2.5 pt-1">
              {bySub.map((r) => {
                const pct = r.yoy === null ? 0 : Math.min(Math.abs(r.yoy) / 30, 1) * 100;
                return (
                  <div key={r.sub.id}>
                    <div className="mb-1 flex items-center justify-between text-[12.5px]">
                      <span className="font-semibold" style={{ color: "var(--ink-900)" }}>
                        {localizedSegment(r.sub, locale)}
                      </span>
                      {r.yoy === null ? (
                        <span className="tabular-nums font-bold" style={{ color: "var(--ink-400)" }}>
                          {isZh ? "无上年同期数据" : "No prior-year data"}
                        </span>
                      ) : (
                        <span className="tabular-nums font-bold" style={{ color: r.yoy >= 0 ? "var(--delta-up)" : "var(--delta-down)" }}>
                          {r.yoy >= 0 ? "+" : ""}
                          {fmt1(r.yoy)}%
                        </span>
                      )}
                    </div>
                    <div className="h-[7px] overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(pct, 2)}%`, background: r.yoy === null ? "var(--border-strong)" : r.yoy >= 0 ? "var(--delta-up)" : "var(--delta-down)" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={dict.m.costStructCard} unit={dict.common.yi}>
            <div className="flex flex-col gap-2.5">
              {costRows.map((c) => {
                const pct = totalRevenue > 0 ? (c.value / totalRevenue) * 100 : 0;
                return (
                  <div key={c.name}>
                    <div className="mb-1 flex items-center justify-between text-[12.5px]">
                      <span className="font-semibold" style={{ color: "var(--ink-900)" }}>
                        {c.name}
                      </span>
                      <span className="tabular-nums font-bold" style={{ color: "var(--ink-900)" }}>
                        {fmtM(c.value)} {dict.common.yi} · {fmt1(pct)}%
                      </span>
                    </div>
                    <div className="h-[7px] overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(pct * 2.6, 100)}%`, background: c.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card title={opCostTrendTitle} unit="%">
            <TrendChart labels={months} suffix="%" series={[{ name: dict.m.cost, color: "var(--cat-4)", data: opCostRatioByMonth }]} />
          </Card>
        </div>

        <Card title={dict.m.opsTableCard}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2">{dict.m.thSubsidiary}</th>
                  <th className="pb-2 text-right">{dict.m.revenue}</th>
                  <th className="pb-2 text-right">{dict.m.cost}</th>
                  <th className="pb-2 text-right">{dict.m.grossMargin}</th>
                  <th className="pb-2 text-right">{dict.m.thYoy}</th>
                </tr>
              </thead>
              <tbody>
                {bySub.map((r) => (
                  <tr key={r.sub.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {localizedSegment(r.sub, locale)}
                    </td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(r.revenue)}</td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(r.cost)}</td>
                    <td className="tabular-nums py-2.5 text-right" style={{ color: r.margin < 0 ? "var(--status-critical)" : undefined }}>
                      {fmt1(r.margin)}%
                    </td>
                    <td className="tabular-nums py-2.5 text-right font-bold" style={{ color: r.yoy === null ? "var(--ink-400)" : r.yoy >= 0 ? "var(--delta-up)" : "var(--delta-down)" }}>
                      {r.yoy === null ? (isZh ? "无数据" : "N/A") : `${r.yoy >= 0 ? "+" : ""}${fmt1(r.yoy)}%`}
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

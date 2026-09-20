import { MapPin, TrendingUp, TrendingDown, PieChart } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney } from "@/lib/i18n/dictionaries";
import { localizedName } from "@/lib/localize";
import { getBaseCurrency } from "@/lib/currency";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import RankList from "@/components/ui/RankList";

const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const REGION_COLORS = ["var(--cat-3)", "var(--cat-1)", "var(--cat-2)", "var(--status-serious)", "var(--cat-4)"];

export default async function RegionPage() {
  const user = await requireUser();
  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";

  const organizationId = user.organizationId;
  const baseCurrency = await getBaseCurrency(organizationId);
  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);
  const fmtM = (n: number) => fmtMoney(n, locale);
  const regions = await db.region.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } });
  const monthly = await db.regionMonthlyFinancial.findMany({ where: { year: { in: [2025, 2026] }, organizationId } });

  const rows = regions.map((r, i) => {
    const cur = monthly.filter((m) => m.regionId === r.id && m.year === 2026);
    const prev = monthly.filter((m) => m.regionId === r.id && m.year === 2025);
    const revenue = cur.reduce((a, m) => a + Number(m.revenue), 0);
    const netProfit = cur.reduce((a, m) => a + Number(m.netProfit), 0);
    const prevRevenue = prev.reduce((a, m) => a + Number(m.revenue), 0);
    // null (not 0) when there's no real prior-year figure to compare against
    const yoy = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;
    return { region: r, revenue, netProfit, yoy, color: REGION_COLORS[i % REGION_COLORS.length] };
  });

  const totalRevenue = rows.reduce((a, r) => a + r.revenue, 0);
  const withYoy = rows.filter((r) => r.yoy !== null) as (Omit<(typeof rows)[number], "yoy"> & { yoy: number })[];
  const top = withYoy.slice().sort((a, b) => b.yoy - a.yoy)[0];
  const bottom = withYoy.slice().sort((a, b) => a.yoy - b.yoy)[0];
  const sorted = rows.slice().sort((a, b) => b.revenue - a.revenue);
  const concentration = sorted.length >= 2 && totalRevenue > 0 ? ((sorted[0].revenue + sorted[1].revenue) / totalRevenue) * 100 : 0;

  return (
    <>
      <Topbar dict={dict} locale={locale} title={dict.nav.region} desc={dict.nav.region} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiTile icon={MapPin} color="var(--cat-1)" label={dict.m.regionCount} value={String(regions.length)} />
          <KpiTile icon={TrendingUp} color="var(--cat-3)" label={dict.m.topGrowthRegion} value={top ? localizedName(top.region, locale) : "—"} note={top ? `${dict.m.yoy} ${top.yoy >= 0 ? "+" : ""}${fmt1(top.yoy)}%` : ""} />
          <KpiTile icon={TrendingDown} color="var(--status-critical)" label={dict.m.negGrowthRegion} value={bottom ? localizedName(bottom.region, locale) : "—"} note={bottom ? `${dict.m.yoy} ${fmt1(bottom.yoy)}%` : ""} />
          <KpiTile icon={PieChart} color="var(--cat-4)" label={dict.m.regionConcentration} value={fmt1(concentration)} unit="%" />
        </div>

        <Card title={dict.m.regionMapCard} unit={dict.common.yi}>
          <RankList
            items={sorted.map((r) => ({ id: r.region.id, label: localizedName(r.region, locale), value: r.revenue, color: r.color }))}
            valueFmt={fmtM}
          />
        </Card>

        <Card title={dict.m.regionGrowthCard} unit="%">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {rows.map((r) => (
              <div key={r.region.id} className="rounded-xl border p-3.5 text-center" style={{ borderColor: "var(--border)" }}>
                <div className="text-[12.5px] font-semibold" style={{ color: "var(--ink-600)" }}>
                  {localizedName(r.region, locale)}
                </div>
                <div className="tabular-nums mt-1.5 text-[19px] font-extrabold" style={{ color: r.yoy === null ? "var(--ink-400)" : r.yoy >= 0 ? "var(--delta-up)" : "var(--delta-down)" }}>
                  {r.yoy === null ? (isZh ? "无上年数据" : "No prior data") : `${r.yoy >= 0 ? "+" : ""}${fmt1(r.yoy)}%`}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title={dict.m.regionDetailCard}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2">{dict.m.thRegion}</th>
                  <th className="pb-2 text-right">{dict.m.revenue} ({dict.common.yi})</th>
                  <th className="pb-2 text-right">{dict.m.netProfit} ({dict.common.yi})</th>
                  <th className="pb-2 text-right">{dict.m.netMargin}</th>
                  <th className="pb-2 text-right">{dict.m.thShare}</th>
                  <th className="pb-2 text-right">{dict.m.thYoy}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.region.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {localizedName(r.region, locale)}
                    </td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(r.revenue)}</td>
                    <td className="tabular-nums py-2.5 text-right" style={{ color: r.netProfit < 0 ? "var(--status-critical)" : undefined }}>
                      {fmtM(r.netProfit)}
                    </td>
                    <td className="tabular-nums py-2.5 text-right" style={{ color: r.netProfit < 0 ? "var(--status-critical)" : undefined }}>
                      {fmt1(r.revenue > 0 ? (r.netProfit / r.revenue) * 100 : 0)}%
                    </td>
                    <td className="tabular-nums py-2.5 text-right">{fmt1(totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0)}%</td>
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

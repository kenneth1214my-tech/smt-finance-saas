import { Building2, TrendingUp, ShieldAlert, Percent } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { db } from "@/lib/db";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney } from "@/lib/i18n/dictionaries";
import { localizedName, localizedSegment } from "@/lib/localize";
import { getBaseCurrency } from "@/lib/currency";
import { effectiveRiskRating } from "@/lib/risk-rating";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import RankList from "@/components/ui/RankList";
import StatusPill from "@/components/ui/StatusPill";

const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const RISK_TONE: Record<string, "good" | "warning" | "serious" | "critical"> = { GOOD: "good", WARNING: "warning", SERIOUS: "serious", CRITICAL: "critical" };

export default async function SubPage() {
  const user = await requireUser();
  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";

  const organizationId = user.organizationId;
  const baseCurrency = await getBaseCurrency(organizationId);
  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);
  const fmtM = (n: number) => fmtMoney(n, locale);
  const subsidiaries = await db.subsidiary.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } });
  const monthly = await db.monthlyFinancial.findMany({ where: { year: { in: [2025, 2026] }, organizationId } });

  const rows = subsidiaries.map((s) => {
    const cur = monthly.filter((m) => m.subsidiaryId === s.id && m.year === 2026);
    const prev = monthly.filter((m) => m.subsidiaryId === s.id && m.year === 2025);
    const revenue = cur.reduce((a, r) => a + Number(r.revenue), 0);
    const netProfit = cur.reduce((a, r) => a + Number(r.netProfit), 0);
    const prevRevenue = prev.reduce((a, r) => a + Number(r.revenue), 0);
    // null (not 0) when there's no real prior-year figure to compare against
    const yoy = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;
    const equity = Number(s.equity);
    // ROE = net profit ÷ equity, computed from real data rather than hand-typed — see 组织架构管理
    // where equity is entered. null (not 0) when there's no real equity on file yet — a "0.0%"
    // reads as a genuine flat ROE, not "we don't actually know this entity's equity".
    const roe = equity > 0 ? (netProfit / equity) * 100 : null;
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    // yoy ?? 0 only matters for escalation, which only ever triggers on negative growth — with no
    // prior-year baseline there's nothing to escalate from, so this can't fake a decline. Risk
    // escalation uses a separate margin signal from the DISPLAYED netMargin: with zero revenue,
    // netMargin is genuinely undefined and shown as 0% — but a real net loss with no revenue to
    // show for it is still a real loss, not "healthy", so it escalates as if margin were -100%
    // without corrupting the displayed ratio itself.
    const marginForRisk = revenue > 0 ? netMargin : netProfit < 0 ? -100 : 0;
    const effRisk = effectiveRiskRating(s.riskRating, yoy ?? 0, marginForRisk);
    return { sub: s, revenue, netProfit, netMargin, yoy, roe, effRisk };
  });

  // Average across entities that actually HAVE equity on file — including a null (no-data) ROE
  // as 0 would silently drag the average toward "healthy" for entities we know nothing about.
  const roeRows = rows.filter((r): r is typeof rows[number] & { roe: number } => r.roe !== null);
  const avgRoe = roeRows.length ? roeRows.reduce((a, r) => a + r.roe, 0) / roeRows.length : 0;
  const riskSubCount = rows.filter((r) => r.effRisk !== "GOOD").length;
  const profitableCount = rows.filter((r) => r.netProfit > 0).length;

  const riskLabel = (r: string) => (r === "GOOD" ? dict.m.riskGood : r === "WARNING" ? dict.m.riskWarning : r === "SERIOUS" ? dict.m.riskSerious : dict.m.riskCritical);

  return (
    <>
      <Topbar dict={dict} locale={locale} title={dict.nav.sub} desc={dict.nav.sub} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiTile icon={Building2} color="var(--cat-1)" label={dict.m.subCount} value={String(subsidiaries.length)} />
          <KpiTile icon={Percent} color="var(--status-good)" label={dict.m.profitableShare} value={fmt1(subsidiaries.length > 0 ? (profitableCount / subsidiaries.length) * 100 : 0)} unit="%" />
          <KpiTile icon={ShieldAlert} color="var(--status-warning)" label={dict.m.riskSubCount} value={String(riskSubCount)} unit="" />
          <KpiTile icon={TrendingUp} color="var(--cat-4)" label={dict.m.avgRoe} value={fmt1(avgRoe)} unit="%" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={dict.m.revRankCard} unit={dict.common.yi}>
            <RankList
              items={rows
                .slice()
                .sort((a, b) => b.revenue - a.revenue)
                .map((r) => ({ id: r.sub.id, label: localizedName(r.sub, locale), value: r.revenue, color: r.sub.colorHex }))}
              valueFmt={fmtM}
            />
          </Card>
          <Card title={dict.m.profitRankCard} unit={dict.common.yi}>
            <RankList
              items={rows
                .slice()
                .sort((a, b) => b.netProfit - a.netProfit)
                .map((r) => ({ id: r.sub.id, label: localizedName(r.sub, locale), value: r.netProfit, color: r.sub.colorHex }))}
              valueFmt={fmtM}
            />
          </Card>
        </div>

        <Card title={dict.m.subCompareCard}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2">{dict.m.thSubsidiary}</th>
                  <th className="pb-2">{dict.m.thSegment}</th>
                  <th className="pb-2 text-right">{dict.m.revenue}</th>
                  <th className="pb-2 text-right">{dict.m.netProfit}</th>
                  <th className="pb-2 text-right">{dict.m.netMargin}</th>
                  <th className="pb-2 text-right">{dict.m.roe}</th>
                  <th className="pb-2 text-right">{dict.m.debtRatio}</th>
                  <th className="pb-2 text-right">{dict.m.thYoy}</th>
                  <th className="pb-2">{dict.m.riskRating}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sub.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {localizedName(r.sub, locale)}
                    </td>
                    <td className="py-2.5" style={{ color: "var(--ink-400)" }}>
                      {localizedSegment(r.sub, locale)}
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
                    <td className="tabular-nums py-2.5 text-right">{fmt1(Number(r.sub.debtRatio))}%</td>
                    <td className="tabular-nums py-2.5 text-right font-bold" style={{ color: r.yoy === null ? "var(--ink-400)" : r.yoy >= 0 ? "var(--delta-up)" : "var(--delta-down)" }}>
                      {r.yoy === null ? (isZh ? "无数据" : "N/A") : `${r.yoy >= 0 ? "+" : ""}${fmt1(r.yoy)}%`}
                    </td>
                    <td className="py-2.5">
                      <StatusPill tone={RISK_TONE[r.effRisk]} label={riskLabel(r.effRisk)} />
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

import { ShieldAlert, AlertOctagon, Building2 } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney } from "@/lib/i18n/dictionaries";
import { getBaseCurrency } from "@/lib/currency";
import { computeMonthlyRiskReport } from "@/lib/special-report";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import StatusPill from "@/components/ui/StatusPill";
import MonthlyRiskReportActions from "./MonthlyRiskReportActions";

const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const RISK_TONE: Record<string, "good" | "warning" | "serious" | "critical"> = { GOOD: "good", WARNING: "warning", SERIOUS: "serious", CRITICAL: "critical" };
const SEV_COLOR: Record<string, string> = { GOOD: "var(--status-good)", WARNING: "var(--status-warning)", SERIOUS: "var(--status-serious)", CRITICAL: "var(--status-critical)" };
const CAT_KEY: Record<string, keyof ReturnType<typeof getDictionary>["m"]> = {
  opRisk: "riskCatOpRisk",
  costRisk: "riskCatCostRisk",
  creditRisk: "riskCatCreditRisk",
  marketRisk: "riskCatMarketRisk",
  liquidityRisk: "riskCatLiquidityRisk",
  complianceRisk: "riskCatComplianceRisk",
};

export default async function MonthlyRiskReportPage(props: PageProps<"/report/monthly-risk">) {
  const user = await requireUser();
  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const searchParams = await props.searchParams;
  const now = new Date();
  const year = Number(typeof searchParams.year === "string" ? searchParams.year : now.getFullYear());
  const month = Math.min(12, Math.max(1, Number(typeof searchParams.month === "string" ? searchParams.month : now.getMonth() + 1)));

  const baseCurrency = await getBaseCurrency(user.organizationId);
  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);
  const fmtM = (n: number) => fmtMoney(n, locale);

  const report = await computeMonthlyRiskReport(user.organizationId, year, month, locale);

  const title = isZh ? "月度风险预警报告" : "Monthly Risk Report";
  const high = report.alertsThisMonth.filter((a) => a.severity === "CRITICAL" || a.severity === "SERIOUS");
  const riskEntities = report.byEntity.filter((r) => r.effRisk !== "GOOD");
  const riskLabel = (r: string) => (r === "GOOD" ? dict.m.riskGood : r === "WARNING" ? dict.m.riskWarning : r === "SERIOUS" ? dict.m.riskSerious : dict.m.riskCritical);

  return (
    <>
      <Topbar dict={dict} locale={locale} title={title} desc={`${report.companyName} · ${year}-${String(month).padStart(2, "0")}`} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}>
          <div>
            <div className="text-[15px] font-bold" style={{ color: "var(--ink-900)" }}>
              {report.companyName}
            </div>
            <div className="text-[12px]" style={{ color: "var(--ink-400)" }}>
              {year}-{String(month).padStart(2, "0")} · {isZh ? "生成于" : "Generated"} {report.generatedAt.toISOString().slice(0, 16).replace("T", " ")}
            </div>
          </div>
          <MonthlyRiskReportActions report={report} locale={locale} />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KpiTile icon={ShieldAlert} color="var(--cat-1)" label={dict.m.alertCount} value={String(report.alertsThisMonth.length)} />
          <KpiTile icon={AlertOctagon} color="var(--status-critical)" label={dict.m.highRiskCount} value={String(high.length)} />
          <KpiTile icon={Building2} color="var(--cat-4)" label={dict.m.riskSubCount} value={String(riskEntities.length)} />
        </div>

        <Card title={dict.m.riskByCatCard}>
          {report.alertCategoryCounts.length === 0 ? (
            <p className="text-[12.5px]" style={{ color: "var(--ink-400)" }}>
              {isZh ? "本月无预警" : "No alerts this month"}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {report.alertCategoryCounts.map(({ category, count }) => (
                <div key={category} className="flex items-center justify-between text-[12.5px]">
                  <span className="font-semibold" style={{ color: "var(--ink-900)" }}>
                    {dict.m[CAT_KEY[category]] || category}
                  </span>
                  <span style={{ color: "var(--ink-400)" }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={dict.m.riskListCard}>
          <div className="flex flex-col">
            {report.alertsThisMonth.length === 0 && (
              <p className="py-3 text-[12.5px]" style={{ color: "var(--ink-400)" }}>
                {isZh ? "本月无预警" : "No alerts this month"}
              </p>
            )}
            {report.alertsThisMonth.map((a, i) => (
              <div key={a.id} className="flex items-start gap-3 border-t py-3 first:border-t-0" style={{ borderColor: "var(--border)" }}>
                <div
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-extrabold text-white"
                  style={{ background: SEV_COLOR[a.severity] }}
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.8px] font-medium" style={{ color: "var(--ink-900)" }}>
                    {a.text}
                  </div>
                  <div className="mt-1 text-[11px]" style={{ color: "var(--ink-400)" }}>
                    {a.entityLabel} · {dict.m[CAT_KEY[a.category]] || a.category} · {a.occurredAt.toISOString().slice(5, 10)}
                  </div>
                </div>
                <StatusPill tone={RISK_TONE[a.severity]} label={riskLabel(a.severity)} />
              </div>
            ))}
          </div>
        </Card>

        <Card title={isZh ? "按主体风险评级" : "Risk Rating by Entity"}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2">{isZh ? "主体" : "Entity"}</th>
                  <th className="pb-2 text-right">{dict.m.revenue}</th>
                  <th className="pb-2 text-right">{dict.m.netProfit}</th>
                  <th className="pb-2 text-right">{dict.m.netMargin}</th>
                  <th className="pb-2 text-right">{dict.m.thYoy}</th>
                  <th className="pb-2">{dict.m.riskRating}</th>
                </tr>
              </thead>
              <tbody>
                {report.byEntity.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-[12px]" style={{ color: "var(--ink-400)" }}>
                      {isZh ? "该年度暂无数据" : "No data for this year yet"}
                    </td>
                  </tr>
                )}
                {report.byEntity.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {r.name}
                    </td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(r.revenue)}</td>
                    <td className="tabular-nums py-2.5 text-right" style={{ color: r.netProfit < 0 ? "var(--status-critical)" : undefined }}>
                      {fmtM(r.netProfit)}
                    </td>
                    <td className="tabular-nums py-2.5 text-right" style={{ color: r.netMargin < 0 ? "var(--status-critical)" : undefined }}>
                      {fmt1(r.netMargin)}%
                    </td>
                    <td className="tabular-nums py-2.5 text-right" style={{ color: r.yoy === null ? "var(--ink-400)" : r.yoy >= 0 ? "var(--delta-up)" : "var(--delta-down)" }}>
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

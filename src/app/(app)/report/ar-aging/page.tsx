import { FileSpreadsheet, Clock, AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney } from "@/lib/i18n/dictionaries";
import { getBaseCurrency } from "@/lib/currency";
import { computeARAgingReport } from "@/lib/special-report";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import StackedBar from "@/components/ui/StackedBar";
import StatusPill from "@/components/ui/StatusPill";
import ARAgingReportActions from "./ARAgingReportActions";

const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const BUCKET_COLORS = ["var(--cat-3)", "var(--cat-1)", "var(--cat-2)", "var(--status-serious)", "var(--status-critical)"];
const RISK_TONE: Record<string, "good" | "warning" | "serious" | "critical"> = { GOOD: "good", WARNING: "warning", SERIOUS: "serious", CRITICAL: "critical" };

export default async function ARAgingReportPage(props: PageProps<"/report/ar-aging">) {
  const user = await requireUser();
  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const searchParams = await props.searchParams;
  const year = Number(typeof searchParams.year === "string" ? searchParams.year : new Date().getFullYear());

  const baseCurrency = await getBaseCurrency(user.organizationId);
  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);
  const fmtM = (n: number) => fmtMoney(n, locale);

  const report = await computeARAgingReport(user.organizationId, year, locale);

  const title = isZh ? "应收账龄分析报告" : "AR Aging Analysis Report";
  const statusLabel = (s: string) =>
    s === "GOOD" ? (isZh ? "正常" : "Normal") : s === "WARNING" ? (isZh ? "关注" : "Watch") : s === "SERIOUS" ? (isZh ? "预警" : "Alert") : isZh ? "严重逾期" : "Severely overdue";

  return (
    <>
      <Topbar dict={dict} locale={locale} title={title} desc={`${report.companyName} · ${year}`} user={user} />
      <div className="mx-auto w-full max-w-[1480px] flex-1 space-y-4 px-[26px] py-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}>
          <div>
            <div className="text-[15px] font-bold" style={{ color: "var(--ink-900)" }}>
              {report.companyName}
            </div>
            <div className="text-[12px]" style={{ color: "var(--ink-400)" }}>
              {isZh ? `会计年度 ${year}` : `Fiscal Year ${year}`} · {isZh ? "生成于" : "Generated"} {report.generatedAt.toISOString().slice(0, 16).replace("T", " ")}
              {" · "}
              {isZh ? "以当前应收账款余额生成，非历史快照" : "Generated from current on-file AR balances, not a historical snapshot"}
            </div>
          </div>
          <ARAgingReportActions report={report} locale={locale} baseCurrency={baseCurrency} />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KpiTile icon={FileSpreadsheet} color="var(--cat-1)" label={dict.m.arBalance} value={fmtM(report.totalAR)} unit={dict.common.yi} />
          <KpiTile icon={Clock} color="var(--cat-2)" label={dict.m.dso} value={String(report.dso)} unit={dict.m.dayUnit} />
          <KpiTile icon={AlertTriangle} color="var(--status-critical)" label={dict.m.overdueAmt} value={fmtM(report.overdueAR)} unit={dict.common.yi} note={`${fmt1(report.overduePct)}%`} />
        </div>

        <Card title={dict.m.arAgingCard} unit={`${dict.common.yi} · ${dict.m.total} ${fmtM(report.totalAR)} ${dict.common.yi}`}>
          <StackedBar segments={report.buckets.map((b, i) => ({ label: b.label, value: b.value, color: BUCKET_COLORS[i % BUCKET_COLORS.length] }))} valueFmt={fmtM} />
        </Card>

        <Card title={dict.m.custTableCard}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2">{dict.m.thCustName}</th>
                  <th className="pb-2">{dict.m.thSubsidiary}</th>
                  <th className="pb-2 text-right">{dict.m.arBalance} ({dict.common.yi})</th>
                  <th className="pb-2 text-right">{dict.m.thAgingDays}</th>
                  <th className="pb-2">{dict.m.thStatus}</th>
                </tr>
              </thead>
              <tbody>
                {report.customers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-[12px]" style={{ color: "var(--ink-400)" }}>
                      {isZh ? "暂无应收账款数据" : "No AR data on file yet"}
                    </td>
                  </tr>
                )}
                {report.customers.map((c) => (
                  <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {c.name}
                    </td>
                    <td className="py-2.5" style={{ color: "var(--ink-400)" }}>
                      {c.entityName}
                    </td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(c.balance)}</td>
                    <td className="tabular-nums py-2.5 text-right">{c.agingDays}</td>
                    <td className="py-2.5">
                      <StatusPill tone={RISK_TONE[c.status]} label={statusLabel(c.status)} />
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

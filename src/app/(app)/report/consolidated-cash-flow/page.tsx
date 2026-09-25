import { TrendingUp, TrendingDown, Wallet, ArrowLeftRight } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney } from "@/lib/i18n/dictionaries";
import { getBaseCurrency } from "@/lib/currency";
import { computeConsolidatedCashFlow } from "@/lib/consolidated-report";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import ConsolidatedCashFlowActions from "./ConsolidatedCashFlowActions";

export default async function ConsolidatedCashFlowPage(props: PageProps<"/report/consolidated-cash-flow">) {
  const user = await requireUser();
  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const searchParams = await props.searchParams;
  const year = Number(typeof searchParams.year === "string" ? searchParams.year : new Date().getFullYear());

  const baseCurrency = await getBaseCurrency(user.organizationId);
  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);
  const fmtM = (n: number) => fmtMoney(n, locale);

  const report = await computeConsolidatedCashFlow(user.organizationId, year, locale);

  const title = isZh ? "合并现金流量表" : "Consolidated Cash Flow Statement";

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
            </div>
          </div>
          <ConsolidatedCashFlowActions report={report} locale={locale} baseCurrency={baseCurrency} />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiTile icon={TrendingUp} color="var(--status-good)" label={dict.m.ocf} value={fmtM(report.ocf)} unit={dict.common.yi} />
          <KpiTile icon={TrendingDown} color="var(--cat-3)" label={dict.m.icfNet} value={fmtM(report.icf)} unit={dict.common.yi} />
          <KpiTile icon={Wallet} color="var(--cat-4)" label={dict.m.fcfNet} value={fmtM(report.fcf)} unit={dict.common.yi} />
          <KpiTile
            icon={ArrowLeftRight}
            color={report.netChange < 0 ? "var(--status-critical)" : "var(--cat-1)"}
            label={isZh ? "现金净变动" : "Net Change in Cash"}
            value={fmtM(report.netChange)}
            unit={dict.common.yi}
          />
        </div>

        <Card title={isZh ? "现金流量表明细" : "Cash Flow Detail"} unit={dict.common.yi}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <tbody>
                {[
                  [dict.m.ocf, report.ocf, false],
                  [dict.m.icfNet, report.icf, false],
                  [dict.m.fcfNet, report.fcf, false],
                  [isZh ? "现金净变动" : "Net Change in Cash", report.netChange, true],
                ].map(([label, value, bold], i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={`py-2 ${bold ? "font-bold" : ""}`} style={{ color: "var(--ink-900)" }}>
                      {label as string}
                    </td>
                    <td
                      className={`tabular-nums py-2 text-right ${bold ? "font-bold" : ""}`}
                      style={{ color: Number(value) < 0 ? "var(--status-critical)" : "var(--ink-900)" }}
                    >
                      {fmtM(Number(value))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={isZh ? "按主体拆分" : "Breakdown by Entity"} unit={dict.common.yi}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2">{isZh ? "主体" : "Entity"}</th>
                  <th className="pb-2 text-right">{dict.m.ocf}</th>
                  <th className="pb-2 text-right">{dict.m.icfNet}</th>
                  <th className="pb-2 text-right">{dict.m.fcfNet}</th>
                  <th className="pb-2 text-right">{isZh ? "现金净变动" : "Net Change"}</th>
                </tr>
              </thead>
              <tbody>
                {report.byEntity.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-[12px]" style={{ color: "var(--ink-400)" }}>
                      {isZh ? "暂无现金流数据" : "No cash flow data on file yet"}
                    </td>
                  </tr>
                )}
                {report.byEntity.map((row) => (
                  <tr key={row.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {row.name}
                    </td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(row.ocf)}</td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(row.icf)}</td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(row.fcf)}</td>
                    <td className="tabular-nums py-2.5 text-right font-bold" style={{ color: row.netChange < 0 ? "var(--status-critical)" : undefined }}>
                      {fmtM(row.netChange)}
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

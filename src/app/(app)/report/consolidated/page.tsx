import { TrendingUp, Percent, Wallet, PieChart } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney } from "@/lib/i18n/dictionaries";
import { getBaseCurrency } from "@/lib/currency";
import { computeConsolidatedIncomeStatement } from "@/lib/consolidated-report";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import ConsolidatedReportActions from "./ConsolidatedReportActions";

const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default async function ConsolidatedReportPage(props: PageProps<"/report/consolidated">) {
  const user = await requireUser();
  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const searchParams = await props.searchParams;
  const year = Number(typeof searchParams.year === "string" ? searchParams.year : new Date().getFullYear());

  const baseCurrency = await getBaseCurrency(user.organizationId);
  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);
  const fmtM = (n: number) => fmtMoney(n, locale);

  const report = await computeConsolidatedIncomeStatement(user.organizationId, year, locale);

  const title = isZh ? "合并利润表" : "Consolidated Income Statement";

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
          <ConsolidatedReportActions report={report} locale={locale} baseCurrency={baseCurrency} />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <KpiTile icon={TrendingUp} color="var(--cat-1)" label={dict.m.revenue} value={fmtM(report.revenue)} unit={dict.common.yi} />
          <KpiTile icon={Percent} color="var(--cat-2)" label={dict.m.grossMargin} value={fmt1(report.grossMarginPct)} unit="%" />
          <KpiTile icon={PieChart} color="var(--status-good)" label={dict.m.opProfit} value={fmtM(report.operatingProfit)} unit={dict.common.yi} />
          <KpiTile icon={Wallet} color="var(--cat-4)" label={dict.m.netProfit} value={fmtM(report.netProfit)} unit={dict.common.yi} />
          <KpiTile icon={Percent} color="var(--cat-3)" label={dict.m.netMargin} value={fmt1(report.netMarginPct)} unit="%" />
        </div>

        <Card title={isZh ? "利润表明细" : "Income Statement Detail"} unit={dict.common.yi}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <tbody>
                {[
                  [isZh ? "营业收入" : "Revenue", report.revenue, false],
                  [isZh ? "销售成本" : "Cost of Sales", -report.costOfSales, false],
                  [isZh ? "毛利" : "Gross Profit", report.grossProfit, true],
                  [isZh ? "销售费用" : "Selling Expense", -report.sellExp, false],
                  [isZh ? "管理费用" : "Admin Expense", -report.adminExp, false],
                  [isZh ? "研发费用" : "R&D Expense", -report.rndExp, false],
                  [isZh ? "财务费用" : "Finance Expense", -report.financeExp, false],
                  [isZh ? "营业利润" : "Operating Profit", report.operatingProfit, true],
                  [isZh ? "净利润" : "Net Profit", report.netProfit, true],
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
                  <th className="pb-2 text-right">{dict.m.revenue}</th>
                  <th className="pb-2 text-right">{dict.m.netProfit}</th>
                  <th className="pb-2 text-right">{dict.m.netMargin}</th>
                </tr>
              </thead>
              <tbody>
                {report.byEntity.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-[12px]" style={{ color: "var(--ink-400)" }}>
                      {isZh ? "该年度暂无数据" : "No data for this year yet"}
                    </td>
                  </tr>
                )}
                {report.byEntity.map((row) => (
                  <tr key={row.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {row.name}
                    </td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(row.revenue)}</td>
                    <td className="tabular-nums py-2.5 text-right" style={{ color: row.netProfit < 0 ? "var(--status-critical)" : undefined }}>
                      {fmtM(row.netProfit)}
                    </td>
                    <td className="tabular-nums py-2.5 text-right" style={{ color: row.netMarginPct < 0 ? "var(--status-critical)" : undefined }}>
                      {fmt1(row.netMarginPct)}%
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

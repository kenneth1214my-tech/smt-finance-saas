import { Building2, Landmark, PieChart, Percent } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney } from "@/lib/i18n/dictionaries";
import { getBaseCurrency } from "@/lib/currency";
import { computeConsolidatedBalanceSheet } from "@/lib/consolidated-report";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import KpiTile from "@/components/ui/KpiTile";
import ConsolidatedBalanceSheetActions from "./ConsolidatedBalanceSheetActions";

const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default async function ConsolidatedBalanceSheetPage(props: PageProps<"/report/consolidated-balance-sheet">) {
  const user = await requireUser();
  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const searchParams = await props.searchParams;
  const year = Number(typeof searchParams.year === "string" ? searchParams.year : new Date().getFullYear());

  const baseCurrency = await getBaseCurrency(user.organizationId);
  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);
  const fmtM = (n: number) => fmtMoney(n, locale);

  const report = await computeConsolidatedBalanceSheet(user.organizationId, year, locale);

  const title = isZh ? "合并资产负债表" : "Consolidated Balance Sheet";

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
              {isZh ? "以当前最新余额生成，非历史快照" : "Generated from the current on-file balance, not a historical snapshot"}
              {(report.investmentInSubsidiariesEliminated !== 0 || report.intercompanyEliminated !== 0) && (
                <>
                  {" · "}
                  {isZh
                    ? `已抵消对子公司投资（${fmtM(report.investmentInSubsidiariesEliminated)}）与内部往来款（${fmtM(report.intercompanyEliminated)}），因此下方各主体明细之和不等于本页合计`
                    : `Investment in subsidiaries (${fmtM(report.investmentInSubsidiariesEliminated)}) and intercompany balances (${fmtM(report.intercompanyEliminated)}) eliminated — so the entity breakdown below won't sum to the totals on this page`}
                </>
              )}
            </div>
          </div>
          <ConsolidatedBalanceSheetActions report={report} locale={locale} baseCurrency={baseCurrency} />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiTile icon={Building2} color="var(--cat-1)" label={dict.m.totalAssets} value={fmtM(report.totalAssets)} unit={dict.common.yi} />
          <KpiTile icon={Landmark} color="var(--status-critical)" label={isZh ? "负债总额" : "Total Liabilities"} value={fmtM(report.totalLiabilities)} unit={dict.common.yi} />
          <KpiTile icon={PieChart} color="var(--status-good)" label={isZh ? "所有者权益" : "Total Equity"} value={fmtM(report.totalEquity)} unit={dict.common.yi} />
          <KpiTile icon={Percent} color="var(--cat-4)" label={dict.m.debtRatio} value={fmt1(report.debtRatioPct)} unit="%" />
        </div>

        <Card title={isZh ? "资产负债表明细" : "Balance Sheet Detail"} unit={dict.common.yi}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <tbody>
                {[
                  [isZh ? "资产总额" : "Total Assets", report.totalAssets, true],
                  [isZh ? "负债总额" : "Total Liabilities", report.totalLiabilities, false],
                  [isZh ? "所有者权益" : "Total Equity", report.totalEquity, true],
                ].map(([label, value, bold], i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={`py-2 ${bold ? "font-bold" : ""}`} style={{ color: "var(--ink-900)" }}>
                      {label as string}
                    </td>
                    <td className={`tabular-nums py-2 text-right ${bold ? "font-bold" : ""}`} style={{ color: "var(--ink-900)" }}>
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
                  <th className="pb-2 text-right">{isZh ? "所有者权益" : "Equity"}</th>
                  <th className="pb-2 text-right">{dict.m.debtRatio}</th>
                  <th className="pb-2 text-right">{dict.m.totalAssets}</th>
                  <th className="pb-2 text-right">{isZh ? "负债总额" : "Total Liabilities"}</th>
                </tr>
              </thead>
              <tbody>
                {report.byEntity.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-[12px]" style={{ color: "var(--ink-400)" }}>
                      {isZh ? "暂无资产负债表数据" : "No balance sheet data on file yet"}
                    </td>
                  </tr>
                )}
                {report.byEntity.map((row) => (
                  <tr key={row.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {row.name}
                    </td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(row.equity)}</td>
                    <td className="tabular-nums py-2.5 text-right">{fmt1(row.debtRatio)}%</td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(row.totalAssets)}</td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(row.totalLiabilities)}</td>
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

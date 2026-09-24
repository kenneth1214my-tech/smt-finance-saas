import { requireUser } from "@/lib/dal";
import { getServerLocale } from "@/lib/i18n/locale";
import { getDictionary, withBaseCurrency, fmtMoney } from "@/lib/i18n/dictionaries";
import { getBaseCurrency } from "@/lib/currency";
import { computeAuditedFinancialStatements } from "@/lib/consolidated-report";
import Topbar from "@/components/Topbar";
import Card from "@/components/ui/Card";
import AuditedStatementsActions from "./AuditedStatementsActions";

const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default async function AuditedStatementsPage(props: PageProps<"/report/audited-statements">) {
  const user = await requireUser();
  const locale = await getServerLocale();
  const isZh = locale === "zh" || locale === "zh-Hant";
  const searchParams = await props.searchParams;
  const year = Number(typeof searchParams.year === "string" ? searchParams.year : new Date().getFullYear());

  const baseCurrency = await getBaseCurrency(user.organizationId);
  const dict = withBaseCurrency(getDictionary(locale), locale, baseCurrency);
  const fmtM = (n: number) => fmtMoney(n, locale);

  const report = await computeAuditedFinancialStatements(user.organizationId, year, locale);
  const { incomeStatement: cur, priorIncomeStatement: prior, balanceSheet, companyBalanceSheet, cashFlow, priorCashFlow, equityRollForward } = report;

  const groupRoll = equityRollForward.find((r) => r.scope === "group")!;
  const companyRoll = equityRollForward.find((r) => r.scope === "company") ?? null;
  const companyIncome = cur.byEntity.find((e) => e.id === "__hq__") ?? null;
  const priorCompanyIncome = prior.byEntity.find((e) => e.id === "__hq__") ?? null;

  const title = isZh ? "合并审计财务报表" : "Consolidated Audited Financial Statements";

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
              {isZh ? "及其子公司 (AND ITS SUBSIDIARY)" : "AND ITS SUBSIDIARY"} · {isZh ? `会计年度 ${year}` : `Fiscal Year ${year}`} · {isZh ? "生成于" : "Generated"}{" "}
              {report.generatedAt.toISOString().slice(0, 16).replace("T", " ")}
            </div>
          </div>
          <AuditedStatementsActions report={report} locale={locale} baseCurrency={baseCurrency} />
        </div>

        <div className="rounded-lg px-3.5 py-2.5 text-[11.8px]" style={{ background: "color-mix(in srgb, var(--status-warning) 12%, transparent)", color: "var(--status-warning)" }}>
          {isZh
            ? "本报表由系统根据实时账面数据自动生成管理层编制版，尚未经外部审计师审计 — 与正式对外披露的经审计财务报表在格式上一致，但不构成审计意见，也不能替代法定审计。请在完成外部审计后，将审计师签署的独立审计师报告作为附件一并存档。"
            : "This is a management-prepared statement generated automatically from live on-file data — it has not been audited by an external auditor. It mirrors the format of a formal audited filing but is not an audit opinion and does not substitute for a statutory audit. Attach the auditor's signed Independent Auditor's Report once the external audit is complete."}
        </div>

        {/* Directors' Statement-style summary */}
        <Card title={isZh ? "董事声明摘要" : "Directors' Statement (Summary)"}>
          <div className="space-y-2 text-[12.6px]" style={{ color: "var(--ink-900)" }}>
            <p>
              {isZh
                ? `管理层提呈 ${report.companyName}（"公司"）及其子公司（"集团"）截至 ${year} 年 12 月 31 日的合并财务状况表，以及截至该日止财政年度的合并综合收益表、权益变动表与合并现金流量表。`
                : `Management presents the consolidated statement of financial position of ${report.companyName} (the "Company") and its subsidiary (the "Group") as at 31 December ${year}, and the consolidated statement of comprehensive income, statement of changes in equity and consolidated statement of cash flows for the financial year then ended.`}
            </p>
            <p className="font-semibold">
              {isZh ? "管理层意见：" : "In the opinion of management:"}
            </p>
            <p>
              {isZh
                ? "(a) 上述报表如实反映集团及公司截至上述日期的财务状况，以及集团于该财政年度的财务表现、权益变动与现金流量；且"
                : "(a) the above statements are drawn up so as to give a true and fair view of the financial position of the Group and the Company as at the above date, and the financial performance, changes in equity and cash flows of the Group for the financial year then ended; and"}
            </p>
            <p>
              {isZh
                ? "(b) 于本声明日期，有合理理由相信公司能够在债务到期时偿还债务 — 此项判断待外部审计师核实确认。"
                : "(b) at the date of this statement, there are reasonable grounds to believe the Company will be able to pay its debts as and when they fall due — pending confirmation by the external auditor."}
            </p>
          </div>
        </Card>

        {/* Independent Auditor's Report placeholder — deliberately NOT auto-generated */}
        <Card title={isZh ? "独立审计师报告" : "Independent Auditor's Report"}>
          <div className="flex items-center gap-2.5 rounded-lg border border-dashed px-3.5 py-4 text-[12.6px]" style={{ borderColor: "var(--border-strong)", color: "var(--ink-400)" }}>
            {isZh
              ? "【待附加】此处应附上由持牌公共会计师出具并签署的独立审计师报告正本 — 该意见需要真实的审计程序与专业判断，系统无法自动生成，也不应尝试生成。"
              : "[To be attached] The signed Independent Auditor's Report from a licensed public accountant belongs here — that opinion requires real audit procedures and professional judgment that this system cannot and should not attempt to generate."}
          </div>
        </Card>

        {/* Statement of Financial Position */}
        <Card title={isZh ? `财务状况表 — 截至 ${year} 年 12 月 31 日` : `Statement of Financial Position — as at 31 December ${year}`} unit={dict.common.yi}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2"></th>
                  <th className="pb-2 text-right">{isZh ? "集团 Group" : "Group"}</th>
                  <th className="pb-2 text-right">{isZh ? "公司 Company" : "Company"}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 font-bold" style={{ color: "var(--ink-900)" }}>
                    {dict.m.totalAssets}
                  </td>
                  <td className="tabular-nums py-2 text-right font-bold">{fmtM(balanceSheet.totalAssets)}</td>
                  <td className="tabular-nums py-2 text-right font-bold">{companyBalanceSheet ? fmtM(companyBalanceSheet.totalAssets) : "—"}</td>
                </tr>
                <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2" style={{ color: "var(--ink-900)" }}>
                    {isZh ? "负债总额" : "Total Liabilities"}
                  </td>
                  <td className="tabular-nums py-2 text-right">{fmtM(balanceSheet.totalLiabilities)}</td>
                  <td className="tabular-nums py-2 text-right">{companyBalanceSheet ? fmtM(companyBalanceSheet.totalLiabilities) : "—"}</td>
                </tr>
                <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 font-bold" style={{ color: "var(--ink-900)" }}>
                    {isZh ? "所有者权益" : "Total Equity"}
                  </td>
                  <td className="tabular-nums py-2 text-right font-bold">{fmtM(balanceSheet.totalEquity)}</td>
                  <td className="tabular-nums py-2 text-right font-bold">{companyBalanceSheet ? fmtM(companyBalanceSheet.equity) : "—"}</td>
                </tr>
                <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2" style={{ color: "var(--ink-900)" }}>
                    {dict.m.debtRatio}
                  </td>
                  <td className="tabular-nums py-2 text-right">{fmt1(balanceSheet.debtRatioPct)}%</td>
                  <td className="tabular-nums py-2 text-right">{companyBalanceSheet ? `${fmt1(companyBalanceSheet.debtRatio)}%` : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px]" style={{ color: "var(--ink-400)" }}>
            {isZh
              ? "以当前最新余额生成，非历史快照 — 与正式审计报表中按财年结账日的历史结存不同。"
              : "Generated from the current on-file balance, not a historical year-end snapshot the way a real audited report's figures are."}
          </p>
          {(balanceSheet.investmentInSubsidiariesEliminated !== 0 || balanceSheet.intercompanyEliminated !== 0) && (
            <p className="mt-1 text-[11px]" style={{ color: "var(--ink-400)" }}>
              {isZh
                ? `集团数据已抵消总部对子公司的投资（${fmtM(balanceSheet.investmentInSubsidiariesEliminated)}）与集团内部往来款（${fmtM(balanceSheet.intercompanyEliminated)}），避免子公司净资产在集团总额中被重复计算。`
                : `Group figures eliminate HQ's investment in subsidiaries (${fmtM(balanceSheet.investmentInSubsidiariesEliminated)}) and intercompany balances (${fmtM(balanceSheet.intercompanyEliminated)}) so a subsidiary's net assets aren't double-counted in the Group total.`}
            </p>
          )}
        </Card>

        {/* Consolidated Statement of Comprehensive Income */}
        <Card title={isZh ? `合并综合收益表 — 截至 ${year} 年 12 月 31 日止财政年度` : `Consolidated Statement of Comprehensive Income — FY ${year}`} unit={dict.common.yi}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2"></th>
                  <th className="pb-2 text-right">{year}</th>
                  <th className="pb-2 text-right">{report.priorYear}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [dict.m.revenue, cur.revenue, prior.revenue, false],
                  [isZh ? "销售成本" : "Cost of Sales", -cur.costOfSales, -prior.costOfSales, false],
                  [isZh ? "毛利润" : "Gross Profit", cur.grossProfit, prior.grossProfit, true],
                  [dict.m.sellExp, -cur.sellExp, -prior.sellExp, false],
                  [dict.m.adminExp, -cur.adminExp, -prior.adminExp, false],
                  [dict.m.rndExp, -cur.rndExp, -prior.rndExp, false],
                  [dict.m.financeExp, -cur.financeExp, -prior.financeExp, false],
                  [isZh ? "营业利润" : "Operating Profit", cur.operatingProfit, prior.operatingProfit, true],
                  [isZh ? "净利润/(亏损)" : "Net Profit/(Loss)", cur.netProfit, prior.netProfit, true],
                ].map(([label, value, prevValue, bold], i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className={`py-2 ${bold ? "font-bold" : ""}`} style={{ color: "var(--ink-900)" }}>
                      {label as string}
                    </td>
                    <td className={`tabular-nums py-2 text-right ${bold ? "font-bold" : ""}`}>{fmtM(Number(value))}</td>
                    <td className={`tabular-nums py-2 text-right ${bold ? "font-bold" : ""}`} style={{ color: "var(--ink-400)" }}>
                      {fmtM(Number(prevValue))}
                    </td>
                  </tr>
                ))}
                {companyIncome && (
                  <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2 text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                      {isZh ? "（其中：公司 Company 净利润/(亏损)）" : "(of which: Company-level net profit/(loss))"}
                    </td>
                    <td className="tabular-nums py-2 text-right text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                      {fmtM(companyIncome.netProfit)}
                    </td>
                    <td className="tabular-nums py-2 text-right text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                      {priorCompanyIncome ? fmtM(priorCompanyIncome.netProfit) : "—"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={isZh ? "按主体拆分（营业收入）" : "Breakdown by Entity (Revenue)"} unit={dict.common.yi}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2">{isZh ? "主体" : "Entity"}</th>
                  <th className="pb-2 text-right">{isZh ? "营业收入" : "Revenue"}</th>
                  <th className="pb-2 text-right">{isZh ? "净利润/(亏损)" : "Net Profit/(Loss)"}</th>
                  <th className="pb-2 text-right">{isZh ? "净利率" : "Net Margin"}</th>
                </tr>
              </thead>
              <tbody>
                {cur.byEntity.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-[12px]" style={{ color: "var(--ink-400)" }}>
                      {isZh ? "暂无数据" : "No data on file"}
                    </td>
                  </tr>
                )}
                {cur.byEntity.map((row) => (
                  <tr key={row.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2.5 font-semibold" style={{ color: "var(--ink-900)" }}>
                      {row.name}
                    </td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(row.revenue)}</td>
                    <td className="tabular-nums py-2.5 text-right">{fmtM(row.netProfit)}</td>
                    <td className="tabular-nums py-2.5 text-right">{fmt1(row.netMarginPct)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Statement of Changes in Equity */}
        <Card title={isZh ? `权益变动表 — 截至 ${year} 年 12 月 31 日止财政年度` : `Statement of Changes in Equity — FY ${year}`} unit={dict.common.yi}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2"></th>
                  <th className="pb-2 text-right">{isZh ? "集团 Group" : "Group"}</th>
                  <th className="pb-2 text-right">{isZh ? "公司 Company" : "Company"}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2" style={{ color: "var(--ink-900)" }}>
                    {isZh ? `期初权益（推算）` : "Opening Equity (derived)"}
                  </td>
                  <td className="tabular-nums py-2 text-right">{fmtM(groupRoll.openingEquity)}</td>
                  <td className="tabular-nums py-2 text-right">{companyRoll ? fmtM(companyRoll.openingEquity) : "—"}</td>
                </tr>
                <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2" style={{ color: "var(--ink-900)" }}>
                    {isZh ? "本年度综合收益/(亏损)" : "Total Comprehensive Income/(Loss) for the Year"}
                  </td>
                  <td className="tabular-nums py-2 text-right">{fmtM(groupRoll.netProfit)}</td>
                  <td className="tabular-nums py-2 text-right">{companyRoll ? fmtM(companyRoll.netProfit) : "—"}</td>
                </tr>
                <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 font-bold" style={{ color: "var(--ink-900)" }}>
                    {isZh ? "期末权益" : "Closing Equity"}
                  </td>
                  <td className="tabular-nums py-2 text-right font-bold">{fmtM(groupRoll.closingEquity)}</td>
                  <td className="tabular-nums py-2 text-right font-bold">{companyRoll ? fmtM(companyRoll.closingEquity) : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px]" style={{ color: "var(--ink-400)" }}>
            {isZh
              ? "「期初权益」为当前权益减去本年度净利润的推算值，假设年内无股本或储备变动 — 并非存档的历史期初余额，实际数字请以审计后账目为准。"
              : "Opening Equity is derived as current equity minus this year's net profit, assuming no share capital/reserve movements during the year — not a stored historical opening balance. Treat the audited accounts as the source of truth."}
          </p>
        </Card>

        {/* Consolidated Statement of Cash Flows */}
        <Card title={isZh ? `合并现金流量表 — 截至 ${year} 年 12 月 31 日止财政年度` : `Consolidated Statement of Cash Flows — FY ${year}`} unit={dict.common.yi}>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.6px]">
              <thead>
                <tr className="text-left text-[11.3px] font-semibold" style={{ color: "var(--ink-400)" }}>
                  <th className="pb-2"></th>
                  <th className="pb-2 text-right">{year}</th>
                  <th className="pb-2 text-right">{report.priorYear}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [isZh ? "经营活动现金流" : "Cash Flows from Operating Activities", cashFlow.ocf, priorCashFlow.ocf],
                  [isZh ? "投资活动现金流" : "Cash Flows from Investing Activities", cashFlow.icf, priorCashFlow.icf],
                  [isZh ? "融资活动现金流" : "Cash Flows from Financing Activities", cashFlow.fcf, priorCashFlow.fcf],
                ].map(([label, value, prevValue], i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2" style={{ color: "var(--ink-900)" }}>
                      {label as string}
                    </td>
                    <td className="tabular-nums py-2 text-right">{fmtM(Number(value))}</td>
                    <td className="tabular-nums py-2 text-right" style={{ color: "var(--ink-400)" }}>
                      {fmtM(Number(prevValue))}
                    </td>
                  </tr>
                ))}
                <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 font-bold" style={{ color: "var(--ink-900)" }}>
                    {isZh ? "现金及现金等价物净变动" : "Net Change in Cash and Cash Equivalents"}
                  </td>
                  <td className="tabular-nums py-2 text-right font-bold">{fmtM(cashFlow.netChange)}</td>
                  <td className="tabular-nums py-2 text-right font-bold" style={{ color: "var(--ink-400)" }}>
                    {fmtM(priorCashFlow.netChange)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {/* Notes */}
        <Card title={isZh ? "财务报表附注" : "Notes to the Financial Statements"}>
          <div className="space-y-4 text-[12.6px]" style={{ color: "var(--ink-900)" }}>
            <div>
              <div className="font-bold">1. {isZh ? "公司信息" : "Corporate Information"}</div>
              <p className="mt-1" style={{ color: "var(--ink-600)" }}>
                {isZh
                  ? `${report.companyName}（"公司"）及其子公司（"集团"）从事的主要业务详见组织架构管理中登记的各主体信息。`
                  : `${report.companyName} (the "Company") and its subsidiary (the "Group") — principal activities as registered under Org Structure Management for each entity.`}
              </p>
            </div>
            <div>
              <div className="font-bold">2. {isZh ? "费用分类" : "Expense Categorization"}</div>
              <p className="mt-1" style={{ color: "var(--ink-600)" }}>
                {isZh
                  ? "营业费用按销售/管理/研发/财务四类列示，分类依据为「费用分类映射」（Settings → 数据导入与ERP）中记录的真实科目对应关系。"
                  : "Operating expenses are categorized into Selling/Admin/R&D/Finance, per the real account-to-category mapping recorded under Expense Category Mapping (Settings → Data Import & ERP)."}
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-[12px]">
                  <tbody>
                    {[
                      [dict.m.sellExp, cur.sellExp],
                      [dict.m.adminExp, cur.adminExp],
                      [dict.m.rndExp, cur.rndExp],
                      [dict.m.financeExp, cur.financeExp],
                    ].map(([label, value], i) => (
                      <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="py-1.5" style={{ color: "var(--ink-600)" }}>
                          {label as string}
                        </td>
                        <td className="tabular-nums py-1.5 text-right">{fmtM(Number(value))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <div className="font-bold">3. {isZh ? "其他附注" : "Further Notes"}</div>
              <p className="mt-1" style={{ color: "var(--ink-400)" }}>
                {isZh
                  ? "完整的法定财务报表附注（如固定资产变动明细、应收账款账龄分析等）需要比本系统当前记录更细颗粒度的数据，且须由外部审计师在审计过程中编制确认，本系统暂不自动生成。"
                  : "Full statutory notes (e.g. PP&E movement schedules, trade receivables ageing) require finer-grained data than this system currently captures, and must be prepared and confirmed by the external auditor during the audit — not auto-generated here."}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

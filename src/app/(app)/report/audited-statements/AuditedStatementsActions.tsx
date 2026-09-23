"use client";

import { Printer, Download } from "lucide-react";
import { useState } from "react";
import { exportToCsv, exportToXlsx, type ExportColumn } from "@/lib/export";
import type { AuditedFinancialStatements } from "@/lib/consolidated-report";
import type { Locale } from "@/lib/i18n/dictionaries";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default function AuditedStatementsActions({ report, locale, baseCurrency }: { report: AuditedFinancialStatements; locale: Locale; baseCurrency: string }) {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [open, setOpen] = useState(false);
  const fmtM = (n: number) => `${n < 0 ? "-" : ""}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${baseCurrency}`;

  const { incomeStatement: cur, priorIncomeStatement: prior, balanceSheet, companyBalanceSheet, cashFlow, priorCashFlow, equityRollForward } = report;
  const groupRoll = equityRollForward.find((r) => r.scope === "group")!;
  const companyRoll = equityRollForward.find((r) => r.scope === "company") ?? null;

  function printReport() {
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      alert(isZh ? "浏览器已拦截打印窗口，请允许弹出窗口后重试" : "Your browser blocked the print window — please allow pop-ups and try again");
      return;
    }
    const styles = `
      body{font-family:-apple-system,"Segoe UI",Arial,sans-serif;padding:32px;color:#111}
      h1{font-size:18px;margin:0 0 2px;text-align:center}
      h1.sub{font-size:13px;margin:0 0 4px;text-align:center;font-weight:normal}
      .meta{font-size:12px;color:#666;margin:0 0 16px;text-align:center}
      .notice{font-size:11px;color:#92400e;background:#fef3c7;padding:8px 12px;border-radius:6px;margin-bottom:20px}
      .placeholder{font-size:11.5px;color:#999;border:1px dashed #ccc;border-radius:6px;padding:14px;margin:8px 0 20px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px}
      th,td{border-bottom:1px solid #ddd;padding:5px 8px;text-align:left}
      td.num,th.num{text-align:right}
      tr.bold td{font-weight:bold}
      h2{font-size:13.5px;margin:18px 0 8px;border-bottom:2px solid #333;padding-bottom:4px}
      @media print{ body{padding:0} h2{page-break-after:avoid} table{page-break-inside:auto} tr{page-break-inside:avoid} }
    `;
    const row = (label: string, cur: number, prev: number, bold = false) =>
      `<tr${bold ? ' class="bold"' : ""}><td>${escapeHtml(label)}</td><td class="num">${escapeHtml(fmtM(cur))}</td><td class="num" style="color:#888">${escapeHtml(fmtM(prev))}</td></tr>`;
    const incomeRows =
      row(isZh ? "营业收入" : "Revenue", cur.revenue, prior.revenue) +
      row(isZh ? "销售成本" : "Cost of Sales", -cur.costOfSales, -prior.costOfSales) +
      row(isZh ? "毛利润" : "Gross Profit", cur.grossProfit, prior.grossProfit, true) +
      row(isZh ? "销售费用" : "Selling Exp.", -cur.sellExp, -prior.sellExp) +
      row(isZh ? "管理费用" : "Admin Exp.", -cur.adminExp, -prior.adminExp) +
      row(isZh ? "研发费用" : "R&D Exp.", -cur.rndExp, -prior.rndExp) +
      row(isZh ? "财务费用" : "Finance Exp.", -cur.financeExp, -prior.financeExp) +
      row(isZh ? "营业利润" : "Operating Profit", cur.operatingProfit, prior.operatingProfit, true) +
      row(isZh ? "净利润/(亏损)" : "Net Profit/(Loss)", cur.netProfit, prior.netProfit, true);
    const entityRows = cur.byEntity
      .map((r) => `<tr><td>${escapeHtml(r.name)}</td><td class="num">${escapeHtml(fmtM(r.revenue))}</td><td class="num">${escapeHtml(fmtM(r.netProfit))}</td><td class="num">${r.netMarginPct.toFixed(1)}%</td></tr>`)
      .join("");
    const bsRows =
      `<tr class="bold"><td>${escapeHtml(isZh ? "资产总额" : "Total Assets")}</td><td class="num">${escapeHtml(fmtM(balanceSheet.totalAssets))}</td><td class="num">${companyBalanceSheet ? escapeHtml(fmtM(companyBalanceSheet.totalAssets)) : "—"}</td></tr>` +
      `<tr><td>${escapeHtml(isZh ? "负债总额" : "Total Liabilities")}</td><td class="num">${escapeHtml(fmtM(balanceSheet.totalLiabilities))}</td><td class="num">${companyBalanceSheet ? escapeHtml(fmtM(companyBalanceSheet.totalLiabilities)) : "—"}</td></tr>` +
      `<tr class="bold"><td>${escapeHtml(isZh ? "所有者权益" : "Total Equity")}</td><td class="num">${escapeHtml(fmtM(balanceSheet.totalEquity))}</td><td class="num">${companyBalanceSheet ? escapeHtml(fmtM(companyBalanceSheet.equity)) : "—"}</td></tr>`;
    const equityRows =
      `<tr><td>${escapeHtml(isZh ? "期初权益（推算）" : "Opening Equity (derived)")}</td><td class="num">${escapeHtml(fmtM(groupRoll.openingEquity))}</td><td class="num">${companyRoll ? escapeHtml(fmtM(companyRoll.openingEquity)) : "—"}</td></tr>` +
      `<tr><td>${escapeHtml(isZh ? "本年度综合收益/(亏损)" : "Total Comprehensive Income/(Loss)")}</td><td class="num">${escapeHtml(fmtM(groupRoll.netProfit))}</td><td class="num">${companyRoll ? escapeHtml(fmtM(companyRoll.netProfit)) : "—"}</td></tr>` +
      `<tr class="bold"><td>${escapeHtml(isZh ? "期末权益" : "Closing Equity")}</td><td class="num">${escapeHtml(fmtM(groupRoll.closingEquity))}</td><td class="num">${companyRoll ? escapeHtml(fmtM(companyRoll.closingEquity)) : "—"}</td></tr>`;
    const cfRows =
      row(isZh ? "经营活动现金流" : "Operating Activities", cashFlow.ocf, priorCashFlow.ocf) +
      row(isZh ? "投资活动现金流" : "Investing Activities", cashFlow.icf, priorCashFlow.icf) +
      row(isZh ? "融资活动现金流" : "Financing Activities", cashFlow.fcf, priorCashFlow.fcf) +
      row(isZh ? "现金净变动" : "Net Change in Cash", cashFlow.netChange, priorCashFlow.netChange, true);

    win.document.write(
      `<!DOCTYPE html><html><head><title>${escapeHtml(report.companyName)} - ${isZh ? "合并审计财务报表" : "Consolidated Audited Financial Statements"}</title><style>${styles}</style></head><body>` +
        `<h1>${escapeHtml(report.companyName)}</h1>` +
        `<h1 class="sub">${escapeHtml(isZh ? "及其子公司" : "AND ITS SUBSIDIARY")}</h1>` +
        `<div class="meta">${escapeHtml(isZh ? "会计年度" : "Fiscal Year")} ${report.year} · ${escapeHtml(isZh ? "生成于" : "Generated")} ${report.generatedAt.toISOString().slice(0, 16).replace("T", " ")}</div>` +
        `<div class="notice">${escapeHtml(
          isZh
            ? "本报表为管理层编制版，尚未经外部审计师审计，不构成审计意见。"
            : "Management-prepared statement, not audited by an external auditor — does not constitute an audit opinion."
        )}</div>` +
        `<h2>${escapeHtml(isZh ? "独立审计师报告" : "Independent Auditor's Report")}</h2>` +
        `<div class="placeholder">${escapeHtml(isZh ? "【待附加】由持牌公共会计师签署的独立审计师报告正本" : "[To be attached] The signed Independent Auditor's Report from a licensed public accountant")}</div>` +
        `<h2>${escapeHtml(isZh ? `财务状况表 — 截至 ${report.year} 年 12 月 31 日` : `Statement of Financial Position — as at 31 Dec ${report.year}`)}</h2>` +
        `<table><thead><tr><th></th><th class="num">${escapeHtml(isZh ? "集团" : "Group")}</th><th class="num">${escapeHtml(isZh ? "公司" : "Company")}</th></tr></thead><tbody>${bsRows}</tbody></table>` +
        `<h2>${escapeHtml(isZh ? "合并综合收益表" : "Consolidated Statement of Comprehensive Income")}</h2>` +
        `<table><thead><tr><th></th><th class="num">${report.year}</th><th class="num">${report.priorYear}</th></tr></thead><tbody>${incomeRows}</tbody></table>` +
        `<h2>${escapeHtml(isZh ? "按主体拆分" : "Breakdown by Entity")}</h2>` +
        `<table><thead><tr><th>${escapeHtml(isZh ? "主体" : "Entity")}</th><th class="num">${escapeHtml(isZh ? "营业收入" : "Revenue")}</th><th class="num">${escapeHtml(isZh ? "净利润" : "Net Profit")}</th><th class="num">${escapeHtml(isZh ? "净利率" : "Net Margin")}</th></tr></thead><tbody>${entityRows}</tbody></table>` +
        `<h2>${escapeHtml(isZh ? "权益变动表" : "Statement of Changes in Equity")}</h2>` +
        `<table><thead><tr><th></th><th class="num">${escapeHtml(isZh ? "集团" : "Group")}</th><th class="num">${escapeHtml(isZh ? "公司" : "Company")}</th></tr></thead><tbody>${equityRows}</tbody></table>` +
        `<h2>${escapeHtml(isZh ? "合并现金流量表" : "Consolidated Statement of Cash Flows")}</h2>` +
        `<table><thead><tr><th></th><th class="num">${report.year}</th><th class="num">${report.priorYear}</th></tr></thead><tbody>${cfRows}</tbody></table>` +
        `</body></html>`
    );
    win.document.close();
    win.focus();
    win.print();
  }

  function exportEntities(format: "csv" | "xlsx") {
    const columns: ExportColumn[] = [
      { key: "name", label: isZh ? "主体" : "Entity" },
      { key: "revenue", label: isZh ? "营业收入" : "Revenue" },
      { key: "netProfit", label: isZh ? "净利润" : "Net Profit" },
      { key: "netMarginPct", label: isZh ? "净利率 %" : "Net Margin %", value: (row) => Number((row.netMarginPct as number).toFixed(1)) },
    ];
    const filename = `audited-statements-by-entity-${report.year}`;
    const rows = cur.byEntity as unknown as Record<string, unknown>[];
    if (format === "csv") exportToCsv(filename, rows, columns);
    else exportToXlsx(filename, rows, columns);
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={printReport}
        className="flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[12.5px] font-bold"
        style={{ borderColor: "var(--border-strong)", color: "var(--ink-900)" }}
      >
        <Printer size={14} />
        {isZh ? "打印 / 另存为 PDF" : "Print / Save as PDF"}
      </button>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white"
          style={{ background: "var(--cat-1)" }}
        >
          <Download size={14} />
          {isZh ? "导出 / Export" : "Export"}
        </button>
        {open && (
          <div className="absolute right-0 z-10 mt-1 min-w-[140px] overflow-hidden rounded-lg border py-1 shadow-lg" style={{ borderColor: "var(--border-strong)", background: "var(--surface)" }}>
            <button onClick={() => exportEntities("csv")} className="block w-full px-3 py-1.5 text-left text-[12.3px]" style={{ color: "var(--ink-900)" }}>
              CSV
            </button>
            <button onClick={() => exportEntities("xlsx")} className="block w-full px-3 py-1.5 text-left text-[12.3px]" style={{ color: "var(--ink-900)" }}>
              Excel (.xlsx)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

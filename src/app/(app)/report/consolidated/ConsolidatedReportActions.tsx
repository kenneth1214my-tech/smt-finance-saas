"use client";

import { Printer, Download } from "lucide-react";
import { useState } from "react";
import { exportToCsv, exportToXlsx, type ExportColumn } from "@/lib/export";
import type { ConsolidatedIncomeStatement } from "@/lib/consolidated-report";
import type { Locale } from "@/lib/i18n/dictionaries";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default function ConsolidatedReportActions({ report, locale, baseCurrency }: { report: ConsolidatedIncomeStatement; locale: Locale; baseCurrency: string }) {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [open, setOpen] = useState(false);
  const fmtM = (n: number) => `${n < 0 ? "-" : ""}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${baseCurrency}`;

  function printReport() {
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      alert(isZh ? "浏览器已拦截打印窗口，请允许弹出窗口后重试" : "Your browser blocked the print window — please allow pop-ups and try again");
      return;
    }
    const lines: [string, number, boolean][] = [
      [isZh ? "营业收入" : "Revenue", report.revenue, false],
      [isZh ? "销售成本" : "Cost of Sales", -report.costOfSales, false],
      [isZh ? "毛利" : "Gross Profit", report.grossProfit, true],
      [isZh ? "销售费用" : "Selling Expense", -report.sellExp, false],
      [isZh ? "管理费用" : "Admin Expense", -report.adminExp, false],
      [isZh ? "研发费用" : "R&D Expense", -report.rndExp, false],
      [isZh ? "财务费用" : "Finance Expense", -report.financeExp, false],
      [isZh ? "营业利润" : "Operating Profit", report.operatingProfit, true],
      [isZh ? "净利润" : "Net Profit", report.netProfit, true],
    ];
    const styles = `
      body{font-family:-apple-system,"Segoe UI",Arial,sans-serif;padding:32px;color:#111}
      h1{font-size:18px;margin:0 0 4px}
      .meta{font-size:12px;color:#666;margin:0 0 20px}
      table{width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:24px}
      th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}
      td.num,th.num{text-align:right}
      tr.bold td{font-weight:700;border-top:1.5px solid #333}
      h2{font-size:13.5px;margin:0 0 8px}
      @media print{ body{padding:0} }
    `;
    const rowsHtml = lines.map(([label, value, bold]) => `<tr class="${bold ? "bold" : ""}"><td>${escapeHtml(label)}</td><td class="num">${escapeHtml(fmtM(value))}</td></tr>`).join("");
    const entityRowsHtml = report.byEntity
      .map((r) => `<tr><td>${escapeHtml(r.name)}</td><td class="num">${escapeHtml(fmtM(r.revenue))}</td><td class="num">${escapeHtml(fmtM(r.netProfit))}</td><td class="num">${r.netMarginPct.toFixed(1)}%</td></tr>`)
      .join("");
    win.document.write(
      `<!DOCTYPE html><html><head><title>${escapeHtml(report.companyName)} - ${isZh ? "合并利润表" : "Consolidated Income Statement"}</title><style>${styles}</style></head><body>` +
        `<h1>${escapeHtml(report.companyName)}</h1>` +
        `<div class="meta">${escapeHtml(isZh ? "合并利润表" : "Consolidated Income Statement")} · ${isZh ? "会计年度" : "Fiscal Year"} ${report.year} · ${escapeHtml(isZh ? "生成于" : "Generated")} ${report.generatedAt.toISOString().slice(0, 16).replace("T", " ")}</div>` +
        `<h2>${escapeHtml(isZh ? "利润表明细" : "Income Statement Detail")}</h2><table>${rowsHtml}</table>` +
        `<h2>${escapeHtml(isZh ? "按主体拆分" : "Breakdown by Entity")}</h2><table><thead><tr><th>${escapeHtml(isZh ? "主体" : "Entity")}</th><th class="num">${escapeHtml(isZh ? "营业收入" : "Revenue")}</th><th class="num">${escapeHtml(isZh ? "净利润" : "Net Profit")}</th><th class="num">${escapeHtml(isZh ? "净利率" : "Net Margin")}</th></tr></thead><tbody>${entityRowsHtml}</tbody></table>` +
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
    const filename = `consolidated-income-statement-${report.year}`;
    const rows = report.byEntity as unknown as Record<string, unknown>[];
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

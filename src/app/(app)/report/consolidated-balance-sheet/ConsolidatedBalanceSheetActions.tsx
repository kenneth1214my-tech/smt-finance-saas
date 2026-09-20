"use client";

import { Printer, Download } from "lucide-react";
import { useState } from "react";
import { exportToCsv, exportToXlsx, type ExportColumn } from "@/lib/export";
import type { ConsolidatedBalanceSheet } from "@/lib/consolidated-report";
import type { Locale } from "@/lib/i18n/dictionaries";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default function ConsolidatedBalanceSheetActions({ report, locale, baseCurrency }: { report: ConsolidatedBalanceSheet; locale: Locale; baseCurrency: string }) {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [open, setOpen] = useState(false);
  const fmtM = (n: number) => `${n < 0 ? "-" : ""}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${baseCurrency}`;

  function printReport() {
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      alert(isZh ? "浏览器已拦截打印窗口，请允许弹出窗口后重试" : "Your browser blocked the print window — please allow pop-ups and try again");
      return;
    }
    const lines: [string, number][] = [
      [isZh ? "资产总额" : "Total Assets", report.totalAssets],
      [isZh ? "负债总额" : "Total Liabilities", report.totalLiabilities],
      [isZh ? "所有者权益" : "Total Equity", report.totalEquity],
    ];
    const styles = `
      body{font-family:-apple-system,"Segoe UI",Arial,sans-serif;padding:32px;color:#111}
      h1{font-size:18px;margin:0 0 4px}
      .meta{font-size:12px;color:#666;margin:0 0 20px}
      table{width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:24px}
      th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}
      td.num,th.num{text-align:right}
      h2{font-size:13.5px;margin:0 0 8px}
      @media print{ body{padding:0} }
    `;
    const rowsHtml = lines.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td class="num">${escapeHtml(fmtM(value))}</td></tr>`).join("");
    const entityRowsHtml = report.byEntity
      .map(
        (r) =>
          `<tr><td>${escapeHtml(r.name)}</td><td class="num">${escapeHtml(fmtM(r.equity))}</td><td class="num">${r.debtRatio.toFixed(1)}%</td><td class="num">${escapeHtml(fmtM(r.totalAssets))}</td><td class="num">${escapeHtml(fmtM(r.totalLiabilities))}</td></tr>`
      )
      .join("");
    win.document.write(
      `<!DOCTYPE html><html><head><title>${escapeHtml(report.companyName)} - ${isZh ? "合并资产负债表" : "Consolidated Balance Sheet"}</title><style>${styles}</style></head><body>` +
        `<h1>${escapeHtml(report.companyName)}</h1>` +
        `<div class="meta">${escapeHtml(isZh ? "合并资产负债表" : "Consolidated Balance Sheet")} · ${isZh ? "会计年度" : "Fiscal Year"} ${report.year} · ${escapeHtml(isZh ? "生成于" : "Generated")} ${report.generatedAt.toISOString().slice(0, 16).replace("T", " ")}</div>` +
        `<h2>${escapeHtml(isZh ? "资产负债表明细" : "Balance Sheet Detail")}</h2><table>${rowsHtml}</table>` +
        `<h2>${escapeHtml(isZh ? "按主体拆分" : "Breakdown by Entity")}</h2><table><thead><tr><th>${escapeHtml(isZh ? "主体" : "Entity")}</th><th class="num">${escapeHtml(isZh ? "所有者权益" : "Equity")}</th><th class="num">${escapeHtml(isZh ? "资产负债率" : "Debt Ratio")}</th><th class="num">${escapeHtml(isZh ? "资产总额" : "Total Assets")}</th><th class="num">${escapeHtml(isZh ? "负债总额" : "Total Liabilities")}</th></tr></thead><tbody>${entityRowsHtml}</tbody></table>` +
        `</body></html>`
    );
    win.document.close();
    win.focus();
    win.print();
  }

  function exportEntities(format: "csv" | "xlsx") {
    const columns: ExportColumn[] = [
      { key: "name", label: isZh ? "主体" : "Entity" },
      { key: "equity", label: isZh ? "所有者权益" : "Equity" },
      { key: "debtRatio", label: isZh ? "资产负债率 %" : "Debt Ratio %", value: (row) => Number((row.debtRatio as number).toFixed(1)) },
      { key: "totalAssets", label: isZh ? "资产总额" : "Total Assets" },
      { key: "totalLiabilities", label: isZh ? "负债总额" : "Total Liabilities" },
    ];
    const filename = `consolidated-balance-sheet-${report.year}`;
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

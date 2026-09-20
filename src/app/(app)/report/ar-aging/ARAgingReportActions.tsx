"use client";

import { Printer, Download } from "lucide-react";
import { useState } from "react";
import { exportToCsv, exportToXlsx, type ExportColumn } from "@/lib/export";
import type { ARAgingReport } from "@/lib/special-report";
import type { Locale } from "@/lib/i18n/dictionaries";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default function ARAgingReportActions({ report, locale, baseCurrency }: { report: ARAgingReport; locale: Locale; baseCurrency: string }) {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [open, setOpen] = useState(false);
  const fmtM = (n: number) => `${n < 0 ? "-" : ""}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${baseCurrency}`;

  function printReport() {
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      alert(isZh ? "浏览器已拦截打印窗口，请允许弹出窗口后重试" : "Your browser blocked the print window — please allow pop-ups and try again");
      return;
    }
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
    const bucketRowsHtml = report.buckets.map((b) => `<tr><td>${escapeHtml(b.label)}</td><td class="num">${escapeHtml(fmtM(b.value))}</td></tr>`).join("");
    const custRowsHtml = report.customers
      .map((c) => `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.entityName)}</td><td class="num">${escapeHtml(fmtM(c.balance))}</td><td class="num">${c.agingDays}</td><td>${escapeHtml(c.status)}</td></tr>`)
      .join("");
    win.document.write(
      `<!DOCTYPE html><html><head><title>${escapeHtml(report.companyName)} - ${isZh ? "应收账龄分析报告" : "AR Aging Analysis Report"}</title><style>${styles}</style></head><body>` +
        `<h1>${escapeHtml(report.companyName)}</h1>` +
        `<div class="meta">${escapeHtml(isZh ? "应收账龄分析报告" : "AR Aging Analysis Report")} · ${isZh ? "会计年度" : "Fiscal Year"} ${report.year} · ${escapeHtml(isZh ? "生成于" : "Generated")} ${report.generatedAt.toISOString().slice(0, 16).replace("T", " ")}</div>` +
        `<h2>${escapeHtml(isZh ? "账龄分布" : "Aging Buckets")}</h2><table>${bucketRowsHtml}</table>` +
        `<h2>${escapeHtml(isZh ? "客户明细" : "Customer Detail")}</h2><table><thead><tr><th>${escapeHtml(isZh ? "客户" : "Customer")}</th><th>${escapeHtml(isZh ? "所属主体" : "Entity")}</th><th class="num">${escapeHtml(isZh ? "余额" : "Balance")}</th><th class="num">${escapeHtml(isZh ? "账龄天数" : "Aging Days")}</th><th>${escapeHtml(isZh ? "状态" : "Status")}</th></tr></thead><tbody>${custRowsHtml}</tbody></table>` +
        `</body></html>`
    );
    win.document.close();
    win.focus();
    win.print();
  }

  function exportCustomers(format: "csv" | "xlsx") {
    const columns: ExportColumn[] = [
      { key: "name", label: isZh ? "客户" : "Customer" },
      { key: "entityName", label: isZh ? "所属主体" : "Entity" },
      { key: "balance", label: isZh ? "余额" : "Balance" },
      { key: "agingDays", label: isZh ? "账龄天数" : "Aging Days" },
      { key: "status", label: isZh ? "状态" : "Status" },
    ];
    const filename = `ar-aging-${report.year}`;
    const rows = report.customers as unknown as Record<string, unknown>[];
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
            <button onClick={() => exportCustomers("csv")} className="block w-full px-3 py-1.5 text-left text-[12.3px]" style={{ color: "var(--ink-900)" }}>
              CSV
            </button>
            <button onClick={() => exportCustomers("xlsx")} className="block w-full px-3 py-1.5 text-left text-[12.3px]" style={{ color: "var(--ink-900)" }}>
              Excel (.xlsx)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { Printer, Download } from "lucide-react";
import { useState } from "react";
import { exportToCsv, exportToXlsx, type ExportColumn } from "@/lib/export";
import type { AuditReport } from "@/lib/audit";
import type { JurisdictionText } from "@/lib/audit-jurisdiction";
import type { Locale } from "@/lib/i18n/dictionaries";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default function AuditReportActions({ report, locale, jt }: { report: AuditReport; locale: Locale; jt: JurisdictionText }) {
  const isZh = locale === "zh" || locale === "zh-Hant";
  const [open, setOpen] = useState(false);
  const title = isZh ? jt.titleZh : jt.titleEn;

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
      .finding{border-top:1px solid #ddd;padding:10px 0;font-size:12px}
      .ref{font-weight:700;color:#2a78d6;font-family:monospace}
      .tag{display:inline-block;background:#eee;border-radius:10px;padding:1px 8px;font-size:10.5px;margin-left:6px}
      .lbl{font-weight:700}
      h2{font-size:13.5px;margin:16px 0 4px}
      @media print{ body{padding:0} }
    `;
    const findingsHtml = report.findings
      .map(
        (f) => `<div class="finding">
          <span class="ref">${escapeHtml(f.findingRef)}</span><span class="tag">${escapeHtml(f.area)}</span><span class="tag">${escapeHtml(f.severity)}</span><span class="tag">${escapeHtml(f.status)}</span>
          <div><span class="lbl">${escapeHtml(isZh ? "发现内容" : "Condition")}:</span> ${escapeHtml(f.condition)}</div>
          <div><span class="lbl">${escapeHtml(isZh ? "审计标准" : "Criteria")}:</span> ${escapeHtml(f.criteria)}</div>
          <div><span class="lbl">${escapeHtml(isZh ? "证据来源" : "Evidence")}:</span> ${escapeHtml(f.evidence)}</div>
          <div><span class="lbl">${escapeHtml(isZh ? "风险影响" : "Risk/Impact")}:</span> ${escapeHtml(f.riskImpact)}</div>
          <div><span class="lbl">${escapeHtml(isZh ? "建议整改措施" : "Recommendation")}:</span> ${escapeHtml(f.recommendation)}</div>
          ${f.managementResponse ? `<div><span class="lbl">${escapeHtml(isZh ? "管理层说明" : "Management Response")}:</span> ${escapeHtml(f.managementResponse)}</div>` : ""}
        </div>`
      )
      .join("");
    const frameworkNote = isZh ? jt.frameworkZh : jt.frameworkEn;
    const disclaimer = isZh ? jt.disclaimerZh : jt.disclaimerEn;
    win.document.write(
      `<!DOCTYPE html><html><head><title>${escapeHtml(report.companyName)} - ${escapeHtml(title)} ${report.year}</title><style>${styles}</style></head><body>` +
        `<h1>${escapeHtml(report.companyName)}</h1>` +
        `<div class="meta">${escapeHtml(title)} · ${isZh ? "会计年度" : "Fiscal Year"} ${report.year} · ${escapeHtml(isZh ? "生成于" : "Generated")} ${report.generatedAt.toISOString().slice(0, 16).replace("T", " ")}</div>` +
        `<h2>${escapeHtml(isZh ? "执行摘要" : "Executive Summary")}</h2><div>${escapeHtml(isZh ? "发现总数" : "Total Findings")}: ${report.totalFindings} · ${escapeHtml(isZh ? "高危/危急" : "High/Critical")}: ${report.highCriticalCount} · ${escapeHtml(isZh ? "已结案" : "Closed")}: ${report.closedCount}</div>` +
        `<p style="font-size:11.5px;color:#555">${escapeHtml(frameworkNote)}</p>` +
        `<p style="font-size:11px;color:#8a6d00;background:#fff8e1;border:1px solid #f0c94d;border-radius:6px;padding:8px">${escapeHtml(disclaimer)}</p>` +
        `<h2>${escapeHtml(isZh ? "详细发现" : "Detailed Findings")}</h2>${findingsHtml || `<p>${escapeHtml(isZh ? "暂无发现" : "No findings")}</p>`}` +
        `</body></html>`
    );
    win.document.close();
    win.focus();
    win.print();
  }

  function exportFindings(format: "csv" | "xlsx") {
    const columns: ExportColumn[] = [
      { key: "findingRef", label: isZh ? "发现编号" : "Finding Ref" },
      { key: "area", label: isZh ? "领域" : "Area" },
      { key: "severity", label: isZh ? "风险等级" : "Severity" },
      { key: "status", label: isZh ? "状态" : "Status" },
      { key: "dateIdentified", label: isZh ? "发现日期" : "Date Identified", value: (row) => (row.dateIdentified as Date).toISOString().slice(0, 10) },
      { key: "entityLabel", label: isZh ? "主体" : "Entity" },
      { key: "transactionRef", label: isZh ? "对象" : "Reference" },
      { key: "amount", label: isZh ? "金额" : "Amount", value: (row) => (row.amount === null ? "" : (row.amount as number)) },
      { key: "condition", label: isZh ? "发现内容" : "Condition" },
      { key: "criteria", label: isZh ? "审计标准" : "Criteria" },
      { key: "evidence", label: isZh ? "证据来源" : "Evidence" },
      { key: "riskImpact", label: isZh ? "风险影响" : "Risk/Impact" },
      { key: "recommendation", label: isZh ? "建议整改措施" : "Recommendation" },
      { key: "managementResponse", label: isZh ? "管理层说明" : "Management Response" },
      { key: "closureEvidence", label: isZh ? "结案证据" : "Closure Evidence" },
    ];
    const filename = `audit-report-${report.year}`;
    const rows = report.findings as unknown as Record<string, unknown>[];
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
            <button onClick={() => exportFindings("csv")} className="block w-full px-3 py-1.5 text-left text-[12.3px]" style={{ color: "var(--ink-900)" }}>
              CSV
            </button>
            <button onClick={() => exportFindings("xlsx")} className="block w-full px-3 py-1.5 text-left text-[12.3px]" style={{ color: "var(--ink-900)" }}>
              Excel (.xlsx)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

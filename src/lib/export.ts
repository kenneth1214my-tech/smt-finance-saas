"use client";

import * as XLSX from "xlsx";

export interface ExportColumn {
  key: string;
  label: string;
  /** Optional formatter for the exported cell value — falls back to the raw row[key]. */
  value?: (row: Record<string, unknown>) => string | number;
}

function toExportRows(rows: Record<string, unknown>[], columns: ExportColumn[]): Record<string, string | number>[] {
  return rows.map((row) => {
    const out: Record<string, string | number> = {};
    for (const col of columns) {
      const raw = col.value ? col.value(row) : row[col.key];
      out[col.label] = raw === null || raw === undefined ? "" : typeof raw === "number" ? raw : String(raw);
    }
    return out;
  });
}

function downloadBlob(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportToCsv(filename: string, rows: Record<string, unknown>[], columns: ExportColumn[]) {
  const data = toExportRows(rows, columns);
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const lines = data.map((r) => columns.map((c) => csvEscape(r[c.label])).join(","));
  // Leading BOM keeps Excel from mangling CJK characters when it opens the CSV.
  const csv = "﻿" + [header, ...lines].join("\r\n");
  downloadBlob(csv, `${filename}.csv`, "text/csv;charset=utf-8;");
}

export function exportToXlsx(filename: string, rows: Record<string, unknown>[], columns: ExportColumn[], sheetName = "Sheet1") {
  const data = toExportRows(rows, columns);
  const ws = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.label) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function printRows(title: string, rows: Record<string, unknown>[], columns: ExportColumn[]) {
  const data = toExportRows(rows, columns);
  const win = window.open("", "_blank", "width=1000,height=750");
  if (!win) {
    alert("浏览器已拦截打印窗口，请允许弹出窗口后重试 / Your browser blocked the print window — please allow pop-ups and try again");
    return;
  }
  const styles = `
    body{font-family:-apple-system,"Segoe UI",Arial,sans-serif;padding:24px;color:#111}
    h1{font-size:16px;margin:0 0 4px}
    .meta{font-size:11px;color:#666;margin:0 0 14px}
    table{width:100%;border-collapse:collapse;font-size:11.5px}
    th,td{border:1px solid #ccc;padding:5px 8px;text-align:left;white-space:nowrap}
    th{background:#f3f3f3}
    @media print{ body{padding:0} }
  `;
  const theadHtml = `<tr>${columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr>`;
  const rowsHtml = data.map((r) => `<tr>${columns.map((c) => `<td>${escapeHtml(String(r[c.label] ?? ""))}</td>`).join("")}</tr>`).join("");
  win.document.write(
    `<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title><style>${styles}</style></head><body><h1>${escapeHtml(title)}</h1><div class="meta">${escapeHtml(new Date().toLocaleString())} · ${data.length} ${data.length === 1 ? "row" : "rows"}</div><table><thead>${theadHtml}</thead><tbody>${rowsHtml}</tbody></table></body></html>`
  );
  win.document.close();
  win.focus();
  win.print();
}

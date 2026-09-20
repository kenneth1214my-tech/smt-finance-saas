import type { XeroReport } from "@/lib/xero";

export interface XeroBalanceSheetResult {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

// "Total Assets"/"Total Liabilities"/"Total Equity" each live in their own Section, but two of
// those sections come back with an empty Title (only "Equity" is titled) — so match by the
// row's own label text instead of the section title, walking every Row/SummaryRow regardless
// of nesting depth. The report is a point-in-time snapshot with the latest period in Cells[1]
// (confirmed against real data: Cells[1] for "30 Sep 2026" vs Cells[2] for the prior-year
// comparison column).
export function parseXeroBalanceSheet(report: XeroReport): XeroBalanceSheetResult {
  const totals: Record<string, number> = {};

  function walk(rows: XeroReport["Rows"]) {
    for (const row of rows) {
      if ((row.RowType === "Row" || row.RowType === "SummaryRow") && row.Cells && row.Cells.length >= 2) {
        const label = (row.Cells[0]?.Value ?? "").trim().toLowerCase();
        const value = parseFloat(row.Cells[1]?.Value ?? "");
        if (!Number.isNaN(value)) {
          if (label === "total assets") totals.totalAssets = value;
          else if (label === "total liabilities") totals.totalLiabilities = value;
          else if (label === "total equity") totals.totalEquity = value;
          else if (label === "net assets" && totals.totalEquity === undefined) totals.totalEquity = value;
        }
      }
      if (row.Rows) walk(row.Rows);
    }
  }

  walk(report.Rows ?? []);

  return {
    totalAssets: totals.totalAssets ?? 0,
    totalLiabilities: totals.totalLiabilities ?? 0,
    totalEquity: totals.totalEquity ?? 0,
  };
}

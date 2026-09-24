import type { XeroReport } from "@/lib/xero";

export interface XeroBalanceSheetResult {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  // Consolidation-elimination line items — only meaningful for a parent entity's own balance
  // sheet (see Organization.investmentInSubsidiaries/dueToSubsidiaries). 0 when not found, which
  // is indistinguishable from "genuinely zero" but that's fine: a parent with no investment/
  // intercompany balance on file should eliminate nothing either way.
  investmentInSubsidiaries: number;
  // Positive = a liability line ("due TO subsidiary" — HQ owes it); negative = an asset line
  // ("due FROM subsidiary" — the subsidiary owes HQ).
  dueToSubsidiaries: number;
}

const INVESTMENT_IN_SUBSIDIARY_RE = /invest(?:ment|ments)?\s*(?:in|of)?\s*subsidiar/i;
const DUE_TO_SUBSIDIARY_RE = /(?:amount\s*)?due\s*to\s*subsidiar/i;
const DUE_FROM_SUBSIDIARY_RE = /(?:amount\s*)?due\s*from\s*subsidiar/i;

// "Total Assets"/"Total Liabilities"/"Total Equity" each live in their own Section, but two of
// those sections come back with an empty Title (only "Equity" is titled) — so match by the
// row's own label text instead of the section title, walking every Row/SummaryRow regardless
// of nesting depth. The report is a point-in-time snapshot with the latest period in Cells[1]
// (confirmed against real data: Cells[1] for "30 Sep 2026" vs Cells[2] for the prior-year
// comparison column).
export function parseXeroBalanceSheet(report: XeroReport): XeroBalanceSheetResult {
  const totals: Record<string, number> = {};
  let investmentInSubsidiaries = 0;
  let dueToSubsidiaries = 0;

  function walk(rows: XeroReport["Rows"]) {
    for (const row of rows) {
      if ((row.RowType === "Row" || row.RowType === "SummaryRow") && row.Cells && row.Cells.length >= 2) {
        const rawLabel = (row.Cells[0]?.Value ?? "").trim();
        const label = rawLabel.toLowerCase();
        const value = parseFloat(row.Cells[1]?.Value ?? "");
        if (!Number.isNaN(value)) {
          if (label === "total assets") totals.totalAssets = value;
          else if (label === "total liabilities") totals.totalLiabilities = value;
          else if (label === "total equity") totals.totalEquity = value;
          else if (label === "net assets" && totals.totalEquity === undefined) totals.totalEquity = value;
          else if (INVESTMENT_IN_SUBSIDIARY_RE.test(rawLabel)) investmentInSubsidiaries += value;
          else if (DUE_TO_SUBSIDIARY_RE.test(rawLabel)) dueToSubsidiaries += value;
          else if (DUE_FROM_SUBSIDIARY_RE.test(rawLabel)) dueToSubsidiaries -= value;
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
    investmentInSubsidiaries,
    dueToSubsidiaries,
  };
}

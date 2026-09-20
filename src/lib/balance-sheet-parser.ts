// Parses the common "balance sheet report" shape that most accounting systems (Xero, MYOB/ABSS,
// QuickBooks, ...) export: a top-level Assets/Liabilities/Equity section, each containing nested
// sub-headers (e.g. Assets > Bank, Current Assets, Fixed Assets) with line items and a subtotal
// per sub-header, ending in an overall Total Assets/Total Liabilities/Total Equity row. Column
// layout varies between exporters (some use a blank spacer column before the value, some don't,
// some carry an extra prior-period comparison column) — see pnl-parser.ts for the shared
// row-reading approach this mirrors: the first non-empty cell is the label, and the first
// non-empty numeric cell after it is the value (current period comes first — confirmed against
// real Xero report data in xero-balance-sheet-parser.ts).
//
// The overall Total Assets/Liabilities/Equity rows are read when present, but are cross-checked
// against the sum of the real line items: some exporters write these as formula cells that were
// never recalculated before saving, so the file's own cached value is a stale 0 even though the
// real numbers are sitting right there in the line items above it (confirmed against a real
// customer file). A 0 in one of these specific rows is therefore treated as "not found" and the
// computed sum is used instead, exactly as pnl-parser.ts already does for Net Profit.

import { toNumber } from "@/lib/pnl-parser";

export interface BalanceSheetParseResult {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  sectionsFound: string[];
}

const SECTION_PATTERNS: { key: "assets" | "liabilities" | "equity"; test: RegExp }[] = [
  { key: "assets", test: /^assets$/i },
  { key: "liabilities", test: /^liabilities$/i },
  { key: "equity", test: /^equity$/i },
];

const TOTAL_PATTERNS: { key: "totalAssets" | "totalLiabilities" | "totalEquity"; test: RegExp }[] = [
  { key: "totalAssets", test: /^total\s+assets$/i },
  { key: "totalLiabilities", test: /^total\s+liabilities$/i },
  { key: "totalEquity", test: /^(total\s+equity|net\s+assets)$/i },
];

function isNumericCell(cell: string): boolean {
  if (!cell) return false;
  const cleaned = cell.replace(/,/g, "").trim();
  if (!cleaned) return false;
  return !Number.isNaN(parseFloat(cleaned.replace(/[()]/g, "")));
}

export function parseBalanceSheetReport(rows: string[][]): BalanceSheetParseResult {
  const sums = { assets: 0, liabilities: 0, equity: 0 };
  const totals: Record<string, number> = {};
  const sectionsFound: string[] = [];
  // Only the three top-level headers (Assets/Liabilities/Equity) change which bucket line items
  // are attributed to — nested sub-headers like "Bank" or "Current Assets" are recorded for UI
  // feedback but deliberately don't reset this, so their line items still count toward the
  // top-level total.
  let currentSectionKey: keyof typeof sums | null = null;

  for (const row of rows) {
    const cells = row.map((c) => (c ?? "").trim());
    const labelIndex = cells.findIndex((c) => c !== "");
    if (labelIndex === -1) continue; // fully blank row

    const label = cells[labelIndex];
    const valueIndex = cells.findIndex((c, i) => i > labelIndex && isNumericCell(c));

    if (valueIndex === -1) {
      const match = SECTION_PATTERNS.find((p) => p.test.test(label));
      if (match) currentSectionKey = match.key;
      sectionsFound.push(label);
      continue;
    }

    const value = toNumber(cells[valueIndex]);
    const totalMatch = TOTAL_PATTERNS.find((p) => p.test.test(label));
    if (totalMatch) {
      if (value !== 0) totals[totalMatch.key] = value; // see file header note on stale-zero formula cells
      continue;
    }
    // A subtotal we don't specifically track (e.g. "Total Bank", "Total Current Assets") — skip
    // it rather than summing it as a line item, or it'd double-count on top of the individual
    // line items it's already a subtotal of.
    if (/^total\b/i.test(label)) continue;

    if (currentSectionKey) sums[currentSectionKey] += value;
  }

  return {
    totalAssets: totals.totalAssets ?? sums.assets,
    totalLiabilities: totals.totalLiabilities ?? sums.liabilities,
    totalEquity: totals.totalEquity ?? sums.equity,
    sectionsFound,
  };
}

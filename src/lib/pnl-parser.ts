// Parses the common "profit & loss report" shape that most accounting systems (Xero, MYOB/ABSS,
// QuickBooks, Wave, ...) export: a title/date-range block, then section headers (Income, Cost of
// Sales, Expenses, Other Income, Other Expense) each followed by line items, ending in explicit
// subtotal rows (Gross Profit, Operating Profit, Net Profit).
//
// Column layout varies a lot between exporters — some use a blank spacer column before the value
// (`[label, "", value]`) to visually indent line items, some don't (`[label, value]`), and some
// carry extra columns for a prior-period comparison (`[label, value, priorValue]`). Rather than
// assume a fixed column index, each row is read as: the first non-empty cell is the label, and
// the first non-empty NUMERIC cell after it is the value (current period comes first — see
// xero-balance-sheet-parser.ts, confirmed against real Xero report data). A label with no numeric
// cell after it is a section header; this is what "sectionsFound" reports back to the UI.
//
// This only handles single-period (one value per row) reports — there's no real-world sample of
// a monthly-column export to build against yet, so multi-period isn't supported.

export interface PnlParseResult {
  revenue: number;
  costOfSales: number;
  expenses: number;
  otherIncome: number;
  otherExpense: number;
  netProfit: number | null; // null if no "Net Profit"/"Net Income" row was found and it couldn't be computed
  grossProfit: number | null;
  operatingProfit: number | null;
  sectionsFound: string[];
  usedComputedNetProfit: boolean;
}

const SECTION_PATTERNS: { key: keyof Pick<PnlParseResult, "revenue" | "costOfSales" | "expenses" | "otherIncome" | "otherExpense">; test: RegExp }[] = [
  { key: "otherIncome", test: /^other\s+income$/i },
  { key: "otherExpense", test: /^other\s+expenses?$/i },
  { key: "revenue", test: /^(income|revenue|trading\s+income|sales)$/i },
  { key: "costOfSales", test: /^cost\s+of\s+(sales|goods\s+sold)$|^cogs$/i },
  { key: "expenses", test: /^(expenses|operating\s+expenses)$/i },
];

const TOTAL_PATTERNS: { key: "grossProfit" | "operatingProfit" | "netProfit"; test: RegExp }[] = [
  { key: "grossProfit", test: /^gross\s+profit$/i },
  { key: "operatingProfit", test: /^operating\s+(profit|income)$/i },
  { key: "netProfit", test: /^net\s+(profit|income)$/i },
];

export function toNumber(s: string): number {
  const cleaned = s.replace(/,/g, "").trim();
  if (!cleaned) return 0;
  // accounting notation: (123.45) means -123.45
  const negative = /^\(.*\)$/.test(cleaned);
  const n = parseFloat(cleaned.replace(/[()]/g, ""));
  if (Number.isNaN(n)) return 0;
  return negative ? -n : n;
}

function isNumericCell(cell: string): boolean {
  if (!cell) return false;
  const cleaned = cell.replace(/,/g, "").trim();
  if (!cleaned) return false;
  return !Number.isNaN(parseFloat(cleaned.replace(/[()]/g, "")));
}

export function parsePnlReport(rows: string[][]): PnlParseResult {
  const sums = { revenue: 0, costOfSales: 0, expenses: 0, otherIncome: 0, otherExpense: 0 };
  const totals: Record<string, number> = {};
  const sectionsFound: string[] = [];
  let currentSectionKey: keyof typeof sums | null = null;

  for (const row of rows) {
    const cells = row.map((c) => (c ?? "").trim());
    const labelIndex = cells.findIndex((c) => c !== "");
    if (labelIndex === -1) continue; // fully blank row

    const label = cells[labelIndex];
    const valueIndex = cells.findIndex((c, i) => i > labelIndex && isNumericCell(c));

    if (valueIndex === -1) {
      // label with no value at all -> section header
      const match = SECTION_PATTERNS.find((p) => p.test.test(label));
      currentSectionKey = match ? match.key : null;
      if (match) sectionsFound.push(label);
      continue;
    }

    const value = toNumber(cells[valueIndex]);
    const totalMatch = TOTAL_PATTERNS.find((p) => p.test.test(label));
    if (totalMatch) {
      // Some exporters write these as formula cells that were never recalculated before saving —
      // Excel shows the right number on open, but the raw cached value in the file is a stale 0
      // (confirmed against a real customer file where every subtotal row, including Net Profit,
      // held a literal "0.00"). A genuine 0 total is indistinguishable from this at the row level,
      // but computing from the real line items below is right either way, so a 0 here is treated
      // as "not found" and falls through to the computed total instead of overriding it with zero.
      if (value !== 0) totals[totalMatch.key] = value;
      continue;
    }
    // A subtotal row we don't specifically track (e.g. "Total Trading Income" under the Income
    // section) — skip it rather than summing it as a line item, or it'd double-count on top of
    // the individual line items it's already a subtotal of.
    if (/^total\b/i.test(label)) continue;

    if (currentSectionKey) sums[currentSectionKey] += value;
  }

  const grossProfit = totals.grossProfit ?? sums.revenue - sums.costOfSales;
  const operatingProfit = totals.operatingProfit ?? grossProfit - sums.expenses;
  const computedNetProfit = operatingProfit + sums.otherIncome - sums.otherExpense;
  const netProfit = totals.netProfit ?? computedNetProfit;

  return {
    revenue: sums.revenue,
    costOfSales: sums.costOfSales,
    expenses: sums.expenses,
    otherIncome: sums.otherIncome,
    otherExpense: sums.otherExpense,
    netProfit,
    grossProfit,
    operatingProfit,
    sectionsFound,
    usedComputedNetProfit: totals.netProfit === undefined,
  };
}

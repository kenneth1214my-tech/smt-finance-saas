import type { XeroReport } from "@/lib/xero";

// Xero's ProfitAndLoss report is a tree of Section rows (Title + nested line-item Rows, ending
// in a SummaryRow with the section total) and standalone Row entries for report-level totals
// like "Net Profit". Account names inside sections vary per org's chart of accounts, but the
// RowType structure and standard section titles (Income/Revenue, Cost of Sales, Net Profit) are
// consistent — mirrors the section semantics in pnl-parser.ts so both feed MonthlyFinancial the
// same way (opCost = cost of sales, not operating expenses).
/** One account line of the P&L: which part of it (revenue / cost of sales / operating expense / other income) and its amount for the month. */
export interface PnlLine {
  kind: "revenue" | "cost" | "expense" | "other";
  label: string;
  value: number;
  /** The Xero section heading the line sits under ("Less Operating Expenses", "Plus Other Income", …). */
  title: string;
  /** +1 if the line adds to net profit (income), −1 if it takes away (cost, expense). Worked out from the report's own section totals. */
  sign: 1 | -1;
}

/** Subtotal rows Xero prints between sections — not accounts, so never kept as lines. */
export const SUBTOTAL_RE = /^(gross\s+(profit|loss)|operating\s+(profit|loss)|net\s+(profit|loss|income)|profit\s+before\s+tax|total\b.*|.*\bsubtotal\b.*)$/i;

export interface XeroPnlResult {
  revenue: number;
  costOfSales: number;
  netProfit: number;
  // Individual line items from expense-type sections (anything that isn't revenue, cost of
  // sales, or "Other Income") — feeds the Selling/Admin/R&D/Finance category split via
  // expense-categories.ts, the same as the Smart P&L Import's expenseLineItems.
  expenseLineItems: { label: string; value: number }[];
  // Depreciation + amortisation from every cost section (Cost of Sales included), recognised by account name. Feeds EBITDA and the
  // derived cash flow.
  depreciation: number;
  // Interest expense (by account name) from every cost section — the part of the finance costs EBIT adds back; bank charges excluded.
  interest: number;
  /** Every account line, so a P&L figure can be traced to the Xero accounts behind it. */
  lines: PnlLine[];
}

export const DEPRECIATION_RE = /depreciat|amortis|amortiz/i;
export const INTEREST_RE = /\binterest\b|finance\s+(costs?|charges?)|borrowing\s+costs?/i;

function cellNumber(cells: { Value?: string }[] | undefined, index: number): number {
  const raw = cells?.[index]?.Value ?? "";
  const n = parseFloat(raw);
  return Number.isNaN(n) ? 0 : n;
}

function sectionTotal(title: string | undefined): boolean {
  return /^(income|revenue|trading\s+income|sales)$/i.test(title ?? "");
}
function costOfSalesSection(title: string | undefined): boolean {
  return /^(less\s+)?cost\s+of\s+(sales|goods\s+sold)$|^cogs$/i.test(title ?? "");
}
function otherIncomeSection(title: string | undefined): boolean {
  return /^other\s+income$/i.test(title ?? "");
}

export function parseXeroPnl(report: XeroReport): XeroPnlResult {
  let revenue = 0;
  let costOfSales = 0;
  let netProfit = 0;
  let foundNetProfit = false;
  const expenseLineItems: { label: string; value: number }[] = [];
  let depreciation = 0;
  let interest = 0;
  const lines: PnlLine[] = [];

  // One entry per top-level section: the section's own total, used to work out which way each section counts in net profit.
  const tops: { title: string; kind: PnlLine["kind"]; total: number; sign: 1 | -1 }[] = [];
  const lineTop: number[] = []; // for every entry of `lines`, the top-level section it belongs to

  function walk(rows: XeroReport["Rows"], inExpenseSection: boolean, inCostOfSales = false, kind: PnlLine["kind"] | null = null, title = "", topIdx = -1) {
    for (const row of rows) {
      if (row.RowType === "Section") {
        const summary = row.Rows?.find((r) => r.RowType === "SummaryRow");
        const total = summary ? cellNumber(summary.Cells, summary.Cells!.length - 1) : 0;
        const isRevenue = sectionTotal(row.Title);
        const isCostOfSales = costOfSalesSection(row.Title);
        const isOtherIncome = otherIncomeSection(row.Title);
        if (isRevenue) revenue += total;
        else if (isCostOfSales) costOfSales += total;
        const ownKind: PnlLine["kind"] = isRevenue ? "revenue" : isCostOfSales ? "cost" : isOtherIncome ? "other" : "expense";
        const idx = topIdx >= 0 ? topIdx : tops.push({ title: (row.Title ?? "").trim(), kind: ownKind, total, sign: ownKind === "cost" ? -1 : ownKind === "expense" ? -1 : 1 }) - 1;
        if (row.Rows) walk(row.Rows, !isRevenue && !isCostOfSales && !isOtherIncome, isCostOfSales, ownKind, (row.Title ?? "").trim(), idx);
      } else if (row.RowType === "Row" && row.Cells && row.Cells.length >= 2) {
        const label = (row.Cells[0]?.Value ?? "").trim();
        if (kind && label && !SUBTOTAL_RE.test(label)) {
          lines.push({ kind, label, value: cellNumber(row.Cells, row.Cells.length - 1), title, sign: -1 });
          lineTop.push(topIdx);
        }
        if (/^net\s+(profit|income)$/i.test(label)) {
          netProfit = cellNumber(row.Cells, row.Cells.length - 1);
          foundNetProfit = true;
        } else if (inExpenseSection && label) {
          expenseLineItems.push({ label, value: cellNumber(row.Cells, row.Cells.length - 1) });
          if (DEPRECIATION_RE.test(label)) depreciation += cellNumber(row.Cells, row.Cells.length - 1);
          if (INTEREST_RE.test(label)) interest += cellNumber(row.Cells, row.Cells.length - 1);
        } else if (inCostOfSales && label) {
          if (DEPRECIATION_RE.test(label)) depreciation += cellNumber(row.Cells, row.Cells.length - 1);
          if (INTEREST_RE.test(label)) interest += cellNumber(row.Cells, row.Cells.length - 1);
        }
      }
    }
  }

  walk(report.Rows ?? [], false);

  // Fallback: if no explicit "Net Profit" row was found, compute it as revenue minus every
  // other section's total (Xero always includes Income and expense-type sections, so summing
  // every SummaryRow except the revenue one approximates net profit).
  if (!foundNetProfit) {
    let otherSections = 0;
    for (const row of report.Rows ?? []) {
      if (row.RowType === "Section" && !sectionTotal(row.Title)) {
        const summary = row.Rows?.find((r) => r.RowType === "SummaryRow");
        if (summary) otherSections += cellNumber(summary.Cells, summary.Cells!.length - 1);
      }
    }
    netProfit = revenue - otherSections;
  }

  // Which way does each section count in net profit? Revenue and "Other Income" add, cost of sales subtracts; every other section (operating
  // expenses, but also income-type sections with another title, or taxation) is worked out from the report itself: the combination of signs that
  // makes the section totals add up to the report's own Net Profit row. If several combinations fit, the one that agrees most with the headings wins.
  if (foundNetProfit) {
    const free = tops.map((t, i) => ({ t, i })).filter((x) => x.t.kind === "expense");
    if (free.length > 0 && free.length <= 12) {
      const base = revenue - costOfSales + tops.filter((x) => x.kind === "other").reduce((a, x) => a + x.total, 0);
      const guess = free.map((x) => (/income|revenue|sales|gain|grant/i.test(x.t.title) && !/expense|cost|loss/i.test(x.t.title) ? 1 : -1));
      let best: { mask: number; score: number } | null = null;
      for (let mask = 0; mask < 1 << free.length; mask++) {
        let v = base;
        free.forEach((x, k) => {
          v += ((mask >> k) & 1 ? 1 : -1) * x.t.total;
        });
        if (Math.abs(v - netProfit) > 0.02) continue;
        const score = free.reduce((a, _, k) => a + (((mask >> k) & 1 ? 1 : -1) === guess[k] ? 1 : 0), 0);
        if (!best || score > best.score) best = { mask, score };
      }
      free.forEach((x, k) => {
        x.t.sign = best ? ((best.mask >> k) & 1 ? 1 : -1) : (guess[k] as 1 | -1);
      });
    }
  }
  lines.forEach((l, n) => {
    const top = lineTop[n] >= 0 ? tops[lineTop[n]] : null;
    l.sign = top ? top.sign : l.kind === "revenue" || l.kind === "other" ? 1 : -1;
  });

  return { revenue, costOfSales, netProfit, expenseLineItems, depreciation, interest, lines };
}

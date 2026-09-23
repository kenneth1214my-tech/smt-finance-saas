import type { XeroReport } from "@/lib/xero";

// Xero's ProfitAndLoss report is a tree of Section rows (Title + nested line-item Rows, ending
// in a SummaryRow with the section total) and standalone Row entries for report-level totals
// like "Net Profit". Account names inside sections vary per org's chart of accounts, but the
// RowType structure and standard section titles (Income/Revenue, Cost of Sales, Net Profit) are
// consistent — mirrors the section semantics in pnl-parser.ts so both feed MonthlyFinancial the
// same way (opCost = cost of sales, not operating expenses).
export interface XeroPnlResult {
  revenue: number;
  costOfSales: number;
  netProfit: number;
  // Individual line items from expense-type sections (anything that isn't revenue, cost of
  // sales, or "Other Income") — feeds the Selling/Admin/R&D/Finance category split via
  // expense-categories.ts, the same as the Smart P&L Import's expenseLineItems.
  expenseLineItems: { label: string; value: number }[];
}

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

  function walk(rows: XeroReport["Rows"], inExpenseSection: boolean) {
    for (const row of rows) {
      if (row.RowType === "Section") {
        const summary = row.Rows?.find((r) => r.RowType === "SummaryRow");
        const total = summary ? cellNumber(summary.Cells, summary.Cells!.length - 1) : 0;
        const isRevenue = sectionTotal(row.Title);
        const isCostOfSales = costOfSalesSection(row.Title);
        const isOtherIncome = otherIncomeSection(row.Title);
        if (isRevenue) revenue += total;
        else if (isCostOfSales) costOfSales += total;
        if (row.Rows) walk(row.Rows, !isRevenue && !isCostOfSales && !isOtherIncome);
      } else if (row.RowType === "Row" && row.Cells && row.Cells.length >= 2) {
        const label = (row.Cells[0]?.Value ?? "").trim();
        if (/^net\s+(profit|income)$/i.test(label)) {
          netProfit = cellNumber(row.Cells, row.Cells.length - 1);
          foundNetProfit = true;
        } else if (inExpenseSection && label) {
          expenseLineItems.push({ label, value: cellNumber(row.Cells, row.Cells.length - 1) });
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

  return { revenue, costOfSales, netProfit, expenseLineItems };
}

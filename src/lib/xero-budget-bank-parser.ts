import type { XeroReport } from "@/lib/xero";

export interface XeroBudgetResult {
  revenueBudget: number;
  costBudgetRate: number;
  expenseBudgetRate: number;
}

function sectionTotal(title: string | undefined): boolean {
  return /^(income|revenue|trading\s+income|sales)$/i.test(title ?? "");
}
function costOfSalesSection(title: string | undefined): boolean {
  return /^(less\s+)?cost\s+of\s+(sales|goods\s+sold)$|^cogs$/i.test(title ?? "");
}
function expensesSection(title: string | undefined): boolean {
  return /^(less\s+)?(operating\s+)?expenses$/i.test(title ?? "");
}

function sumPeriodCells(cells: { Value?: string }[] | undefined): number {
  if (!cells) return 0;
  let sum = 0;
  for (let i = 1; i < cells.length; i++) {
    const n = parseFloat(cells[i]?.Value ?? "");
    if (!Number.isNaN(n)) sum += n;
  }
  return sum;
}

// Budget Summary has one column per period (month) rather than a single value — annual figures
// are the sum across every period column of each section's SummaryRow.
export function parseXeroBudgetSummary(report: XeroReport): XeroBudgetResult {
  let revenueBudget = 0;
  let costBudget = 0;
  let expenseBudget = 0;

  for (const row of report.Rows ?? []) {
    if (row.RowType !== "Section") continue;
    const summary = row.Rows?.find((r) => r.RowType === "SummaryRow");
    if (!summary) continue;
    const total = sumPeriodCells(summary.Cells);
    if (sectionTotal(row.Title)) revenueBudget += total;
    else if (costOfSalesSection(row.Title)) costBudget += total;
    else if (expensesSection(row.Title)) expenseBudget += total;
  }

  return {
    revenueBudget,
    costBudgetRate: revenueBudget > 0 ? (costBudget / revenueBudget) * 100 : 0,
    expenseBudgetRate: revenueBudget > 0 ? (expenseBudget / revenueBudget) * 100 : 0,
  };
}

export interface XeroBankAccountResult {
  name: string;
  balance: number;
}

// Bank Summary lists one row per bank account; the closing balance is consistently the last
// cell in each row across Xero's report variants (with or without an FX column).
export function parseXeroBankSummary(report: XeroReport): XeroBankAccountResult[] {
  const accounts: XeroBankAccountResult[] = [];
  for (const row of report.Rows ?? []) {
    if (row.RowType !== "Section" || !row.Rows) continue;
    for (const r of row.Rows) {
      if (r.RowType !== "Row" || !r.Cells || r.Cells.length < 2) continue;
      const name = (r.Cells[0]?.Value ?? "").trim();
      if (!name) continue;
      const balance = parseFloat(r.Cells[r.Cells.length - 1]?.Value ?? "0");
      if (Number.isNaN(balance)) continue;
      accounts.push({ name, balance });
    }
  }
  return accounts;
}

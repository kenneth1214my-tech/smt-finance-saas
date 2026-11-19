import "server-only";
import { db } from "@/lib/db";
import { suggestCategory, type ExpenseCategory } from "@/lib/expense-categories";
import type { PnlLine } from "@/lib/xero-pnl-parser";

/**
 * Keeps every account line of a month's Xero profit and loss (AccountBalanceMonthly, group "PL_<kind>") so each P&L KPI can be traced to the Xero
 * accounts behind it. An expense line carries its category (SELLING / ADMIN / RND / FINANCE, or UNMAPPED) in `section`, the same mapping the
 * monthly totals use. A month's lines are replaced as a whole on each sync; the balance-sheet sync never touches "PL_" rows.
 */
export async function storePnlLines(args: {
  organizationId: string;
  subsidiaryId: string | null;
  year: number;
  month: number;
  lines: PnlLine[];
  categoryMapping: Record<string, ExpenseCategory>;
}): Promise<void> {
  const { organizationId, subsidiaryId, year, month, lines, categoryMapping } = args;
  const rows = lines
    .filter((l) => Math.abs(l.value) > 0.004)
    .map((l) => ({
      organizationId, subsidiaryId, year, month,
      group: `PL_${l.kind}`,
      // "CATEGORY|sign|Xero heading": the expense category (blank for non-expenses), whether the line adds to (+) or takes from (-) net profit, and the heading
      section: `${l.kind === "expense" ? (categoryMapping[l.label] ?? suggestCategory(l.label) ?? "UNMAPPED") : ""}|${l.sign > 0 ? "+" : "-"}|${l.title}`,
      accountName: l.label,
      balance: Math.round(l.value * 100) / 100,
    }));
  await db.accountBalanceMonthly.deleteMany({ where: { organizationId, subsidiaryId, year, month, group: { startsWith: "PL_" } } });
  if (rows.length > 0) await db.accountBalanceMonthly.createMany({ data: rows });
}

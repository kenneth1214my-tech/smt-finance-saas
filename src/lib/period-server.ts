import "server-only";
import { db } from "@/lib/db";
import { currentFiscal, fiscalOf } from "@/lib/fiscal";

// Years offered in the period selector: every (fiscal) year that has monthly financials, plus this year and the
// selected one (so a link to an empty year still renders a valid selection), newest first.
export async function getReportYears(organizationId: string, selectedYear: number, fye = 12): Promise<number[]> {
  const now = currentFiscal(fye).year;
  if (fye === 12) {
    const rows = await db.monthlyFinancial.findMany({ where: { organizationId }, distinct: ["year"], select: { year: true } });
    return [...new Set<number>([...rows.map((r) => r.year), new Date().getFullYear(), selectedYear])].sort((a, b) => b - a);
  }
  const rows = await db.monthlyFinancial.findMany({ where: { organizationId }, distinct: ["year", "month"], select: { year: true, month: true } });
  return [...new Set<number>([...rows.map((r) => fiscalOf(r.year, r.month, fye).year), now, selectedYear])].sort((a, b) => b - a);
}

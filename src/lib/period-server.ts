import "server-only";
import { db } from "@/lib/db";

// Years offered in the period selector: every year that has monthly financials, plus this year and
// the selected one (so a link to an empty year still renders a valid selection), newest first.
export async function getReportYears(organizationId: string, selectedYear: number): Promise<number[]> {
  const rows = await db.monthlyFinancial.findMany({ where: { organizationId }, distinct: ["year"], select: { year: true } });
  const years = new Set<number>([...rows.map((r) => r.year), new Date().getFullYear(), selectedYear]);
  return [...years].sort((a, b) => b - a);
}

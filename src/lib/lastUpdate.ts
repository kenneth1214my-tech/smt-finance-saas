import "server-only";
import { db } from "@/lib/db";

/**
 * Latest `createdAt` across the tables that represent admin-entered business data (excludes
 * accounts/config), scoped to one organization. Several tables (Budget, RegionMonthlyFinancial,
 * CashFlowMonthly, Subsidiary, Region) have no timestamp column, so they can't be included
 * without a schema migration.
 */
export async function getLastDataUpdate(organizationId: string): Promise<Date | null> {
  const [mf, bank, ar, project, risk, report, importBatch] = await Promise.all([
    db.monthlyFinancial.aggregate({ where: { organizationId }, _max: { createdAt: true } }),
    db.bankAccount.aggregate({ where: { organizationId }, _max: { createdAt: true } }),
    db.aRCustomer.aggregate({ where: { organizationId }, _max: { createdAt: true } }),
    db.project.aggregate({ where: { organizationId }, _max: { createdAt: true } }),
    db.riskAlert.aggregate({ where: { organizationId }, _max: { createdAt: true } }),
    db.reportDoc.aggregate({ where: { organizationId }, _max: { createdAt: true } }),
    db.importBatch.aggregate({ where: { organizationId }, _max: { createdAt: true } }),
  ]);

  const dates = [mf, bank, ar, project, risk, report, importBatch]
    .map((r) => r._max.createdAt)
    .filter((d): d is Date => d !== null);

  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

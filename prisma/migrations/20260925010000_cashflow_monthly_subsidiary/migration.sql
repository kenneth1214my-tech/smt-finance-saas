-- CashFlowMonthly gains subsidiaryId (nullable = group/HQ-level, mirrors MonthlyFinancial) so a
-- period's cash flow can be recorded per entity instead of a single org-wide row that a second
-- import for the same period would silently overwrite instead of sum.
ALTER TABLE "CashFlowMonthly" ADD COLUMN     "subsidiaryId" TEXT;

-- Drop the old org-wide-only unique key.
DROP INDEX "CashFlowMonthly_organizationId_year_month_key";

-- New unique key includes subsidiaryId.
CREATE UNIQUE INDEX "CashFlowMonthly_subsidiaryId_year_month_key" ON "CashFlowMonthly"("subsidiaryId", "year", "month");

-- Postgres treats NULLs as distinct in a unique index, so a partial index enforces at most one
-- HQ-level row per (organizationId, year, month) — same pattern as MonthlyFinancial's.
CREATE UNIQUE INDEX "CashFlowMonthly_hq_year_month_key" ON "CashFlowMonthly" ("organizationId", "year", "month") WHERE "subsidiaryId" IS NULL;

CREATE INDEX "CashFlowMonthly_organizationId_idx" ON "CashFlowMonthly"("organizationId");

-- AddForeignKey
ALTER TABLE "CashFlowMonthly" ADD CONSTRAINT "CashFlowMonthly_subsidiaryId_fkey" FOREIGN KEY ("subsidiaryId") REFERENCES "Subsidiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

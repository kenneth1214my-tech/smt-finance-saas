-- Prevent duplicate filings per entity per (type, period) — a race condition in the auto-create
-- quarterly GST F5 logic (two concurrent page loads both seeing "no row yet") produced a real
-- duplicate in production before this constraint existed.
CREATE UNIQUE INDEX "TaxFiling_subsidiaryId_type_periodLabel_key" ON "TaxFiling"("subsidiaryId", "type", "periodLabel");

-- Postgres treats NULLs as distinct in a unique index, so a partial index enforces the same for
-- HQ-level rows (subsidiaryId IS NULL) — same pattern as CashFlowMonthly/MonthlyFinancial.
CREATE UNIQUE INDEX "TaxFiling_hq_type_periodLabel_key" ON "TaxFiling"("organizationId", "type", "periodLabel") WHERE "subsidiaryId" IS NULL;

-- Group/HQ-level balance sheet figures, mirroring Subsidiary.equity/debtRatio.
ALTER TABLE "Organization" ADD COLUMN "equity" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Organization" ADD COLUMN "debtRatio" DECIMAL(6,2) NOT NULL DEFAULT 0;

-- Budget.subsidiaryId, ARCustomer.subsidiaryId, Payable.subsidiaryId become optional: null =
-- group/HQ-level, not tied to any single subsidiary — same rationale as MonthlyFinancial and
-- BankAccount, so manual import stays a full fallback for everything Xero would otherwise sync.
ALTER TABLE "Budget" ALTER COLUMN "subsidiaryId" DROP NOT NULL;
ALTER TABLE "ARCustomer" ALTER COLUMN "subsidiaryId" DROP NOT NULL;
ALTER TABLE "Payable" ALTER COLUMN "subsidiaryId" DROP NOT NULL;

-- Budget's existing @@unique([subsidiaryId, year]) doesn't dedupe multiple NULL subsidiaryId
-- rows (Postgres treats NULLs as distinct in a unique index), so a partial index enforces at
-- most one HQ-level budget row per (organizationId, year). ARCustomer/Payable have no such
-- compound-unique constraint at all (each row is one customer/vendor, always freely insertable),
-- so no equivalent index is needed there.
CREATE UNIQUE INDEX "Budget_hq_year_key" ON "Budget" ("organizationId", "year") WHERE "subsidiaryId" IS NULL;

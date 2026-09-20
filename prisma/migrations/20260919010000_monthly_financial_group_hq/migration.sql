-- MonthlyFinancial.subsidiaryId becomes optional: null = group/HQ-level P&L, not tied to any
-- single subsidiary (mirrors BankAccount.subsidiaryId). Lets the Smart P&L Import tool and the
-- CSV bulk importer record a group-level P&L when Xero/manual data isn't broken out per subsidiary.
ALTER TABLE "MonthlyFinancial" ALTER COLUMN "subsidiaryId" DROP NOT NULL;

-- The existing @@unique([subsidiaryId, year, month]) doesn't dedupe multiple NULL subsidiaryId
-- rows (Postgres treats NULLs as distinct in a unique index), so a partial index enforces at
-- most one HQ-level row per (organizationId, year, month).
CREATE UNIQUE INDEX "MonthlyFinancial_hq_year_month_key" ON "MonthlyFinancial" ("organizationId", "year", "month") WHERE "subsidiaryId" IS NULL;

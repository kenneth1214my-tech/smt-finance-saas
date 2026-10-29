-- Depreciation + amortisation per month (EBITDA = EBIT + D&A).
ALTER TABLE "MonthlyFinancial" ADD COLUMN "depreciation" DECIMAL(14,2) NOT NULL DEFAULT 0;

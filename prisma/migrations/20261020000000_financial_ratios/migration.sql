-- AlterTable
ALTER TABLE "MonthlyFinancial" ADD COLUMN "employmentCost" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "BalanceSheetMonthly" ADD COLUMN "receivables" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "inventory" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "loansCurrent" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "finLiabCurrent" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "detailed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "sharesOutstanding" DECIMAL(18,0),
ADD COLUMN "sharePrice" DECIMAL(14,4),
ADD COLUMN "dividendPerShare" DECIMAL(14,4);

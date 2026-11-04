-- Month-end balances of deferred revenue / prepayment / accrual accounts, for the internal-audit ledger checks.
CREATE TABLE "AccountBalanceMonthly" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subsidiaryId" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "group" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountBalanceMonthly_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountBalanceMonthly_organizationId_year_month_idx" ON "AccountBalanceMonthly"("organizationId", "year", "month");
CREATE INDEX "AccountBalanceMonthly_subsidiaryId_idx" ON "AccountBalanceMonthly"("subsidiaryId");

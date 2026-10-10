-- CreateTable
CREATE TABLE "BalanceSheetMonthly" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subsidiaryId" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "totalAssets" DECIMAL(14,2) NOT NULL,
    "totalLiabilities" DECIMAL(14,2) NOT NULL,
    "totalEquity" DECIMAL(14,2) NOT NULL,
    "cash" DECIMAL(14,2) NOT NULL,
    "loans" DECIMAL(14,2) NOT NULL,
    "clearing" DECIMAL(14,2) NOT NULL,
    "opAssets" DECIMAL(14,2) NOT NULL,
    "fixedAssets" DECIMAL(14,2) NOT NULL,
    "finAssets" DECIMAL(14,2) NOT NULL,
    "opLiabilities" DECIMAL(14,2) NOT NULL,
    "finLiabilities" DECIMAL(14,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BalanceSheetMonthly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BalanceSheetMonthly_subsidiaryId_year_month_key" ON "BalanceSheetMonthly"("subsidiaryId", "year", "month");

-- Postgres treats NULLs as distinct in a unique index, so a partial index enforces at most one
-- HQ-level row per (organizationId, year, month) — same pattern as CashFlowMonthly / MonthlyFinancial.
CREATE UNIQUE INDEX "BalanceSheetMonthly_hq_year_month_key" ON "BalanceSheetMonthly"("organizationId", "year", "month") WHERE "subsidiaryId" IS NULL;

-- CreateIndex
CREATE INDEX "BalanceSheetMonthly_organizationId_idx" ON "BalanceSheetMonthly"("organizationId");

-- AddForeignKey
ALTER TABLE "BalanceSheetMonthly" ADD CONSTRAINT "BalanceSheetMonthly_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceSheetMonthly" ADD CONSTRAINT "BalanceSheetMonthly_subsidiaryId_fkey" FOREIGN KEY ("subsidiaryId") REFERENCES "Subsidiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

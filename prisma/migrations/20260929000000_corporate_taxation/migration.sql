-- CreateEnum
CREATE TYPE "TaxFilingType" AS ENUM ('ECI', 'FORM_C_S', 'GST_F5');

-- CreateEnum
CREATE TYPE "TaxFilingStatus" AS ENUM ('UPCOMING', 'FILED', 'OVERDUE', 'PAID');

-- CreateTable
CREATE TABLE "CorporateTaxProvision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subsidiaryId" TEXT,
    "year" INTEGER NOT NULL,
    "chargeableIncome" DECIMAL(14,2) NOT NULL,
    "taxRatePct" DECIMAL(5,2) NOT NULL DEFAULT 17,
    "rebatePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "rebateCap" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorporateTaxProvision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxFiling" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subsidiaryId" TEXT,
    "type" "TaxFilingType" NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "filedAt" TIMESTAMP(3),
    "outputTax" DECIMAL(14,2),
    "inputTax" DECIMAL(14,2),
    "amount" DECIMAL(14,2),
    "paidAt" TIMESTAMP(3),
    "status" "TaxFilingStatus" NOT NULL DEFAULT 'UPCOMING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxFiling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeferredTaxItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subsidiaryId" TEXT,
    "year" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "temporaryDifference" DECIMAL(14,2) NOT NULL,
    "deferredTaxAmount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeferredTaxItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CorporateTaxProvision_subsidiaryId_year_key" ON "CorporateTaxProvision"("subsidiaryId", "year");

-- CreateIndex
CREATE INDEX "CorporateTaxProvision_organizationId_idx" ON "CorporateTaxProvision"("organizationId");

-- CreateIndex
CREATE INDEX "TaxFiling_organizationId_idx" ON "TaxFiling"("organizationId");

-- CreateIndex
CREATE INDEX "DeferredTaxItem_organizationId_idx" ON "DeferredTaxItem"("organizationId");

-- AddForeignKey
ALTER TABLE "CorporateTaxProvision" ADD CONSTRAINT "CorporateTaxProvision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateTaxProvision" ADD CONSTRAINT "CorporateTaxProvision_subsidiaryId_fkey" FOREIGN KEY ("subsidiaryId") REFERENCES "Subsidiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxFiling" ADD CONSTRAINT "TaxFiling_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxFiling" ADD CONSTRAINT "TaxFiling_subsidiaryId_fkey" FOREIGN KEY ("subsidiaryId") REFERENCES "Subsidiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeferredTaxItem" ADD CONSTRAINT "DeferredTaxItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeferredTaxItem" ADD CONSTRAINT "DeferredTaxItem_subsidiaryId_fkey" FOREIGN KEY ("subsidiaryId") REFERENCES "Subsidiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

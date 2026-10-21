-- AlterTable
ALTER TABLE "CorporateTaxProvision" ADD COLUMN "lossesBroughtForward" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TaxAdjustment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provisionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxAdjustment_organizationId_idx" ON "TaxAdjustment"("organizationId");

-- CreateIndex
CREATE INDEX "TaxAdjustment_provisionId_idx" ON "TaxAdjustment"("provisionId");

-- AddForeignKey
ALTER TABLE "TaxAdjustment" ADD CONSTRAINT "TaxAdjustment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxAdjustment" ADD CONSTRAINT "TaxAdjustment_provisionId_fkey" FOREIGN KEY ("provisionId") REFERENCES "CorporateTaxProvision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

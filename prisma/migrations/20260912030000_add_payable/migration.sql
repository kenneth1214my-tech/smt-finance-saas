-- CreateTable
CREATE TABLE "Payable" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nameZh" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "subsidiaryId" TEXT NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "agingDays" INTEGER NOT NULL,
    "status" "RiskSeverity" NOT NULL DEFAULT 'GOOD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payable_organizationId_idx" ON "Payable"("organizationId");

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_subsidiaryId_fkey" FOREIGN KEY ("subsidiaryId") REFERENCES "Subsidiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

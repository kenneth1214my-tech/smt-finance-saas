-- Joint ventures (equity method) and their yearly schedule.
CREATE TABLE "JointVenture" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "ownershipPct" DECIMAL(5,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SGD',
    "acquiredOn" TIMESTAMP(3),
    "investmentAccountName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JointVenture_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JointVenturePeriod" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jointVentureId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "capitalAdded" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "jvNetResult" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "jvNetAssets" DECIMAL(14,2),
    "dividendsReceived" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "translation" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "impairment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "hqLedgerCarrying" DECIMAL(14,2),
    "hqLedgerExpense" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JointVenturePeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JointVenture_organizationId_idx" ON "JointVenture"("organizationId");
CREATE INDEX "JointVenturePeriod_organizationId_idx" ON "JointVenturePeriod"("organizationId");
CREATE UNIQUE INDEX "JointVenturePeriod_jointVentureId_year_key" ON "JointVenturePeriod"("jointVentureId", "year");

ALTER TABLE "JointVenturePeriod" ADD CONSTRAINT "JointVenturePeriod_jointVentureId_fkey" FOREIGN KEY ("jointVentureId") REFERENCES "JointVenture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

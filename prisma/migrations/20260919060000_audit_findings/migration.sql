-- Internal Audit module: persisted, stateful findings raised by the automated exception scan
-- (src/lib/audit.ts) or entered manually. Unlike the consolidated/special reports, findings
-- must survive after the underlying condition changes and carry human-entered fields (status,
-- management response, closure evidence) that can't be recomputed.
CREATE TYPE "AuditRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "AuditFindingStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED');

CREATE TABLE "AuditFinding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "findingRef" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "severity" "AuditRiskLevel" NOT NULL,
    "status" "AuditFindingStatus" NOT NULL DEFAULT 'OPEN',
    "dateIdentified" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entityLabel" TEXT,
    "transactionRef" TEXT,
    "amount" DECIMAL(14,2),
    "criteria" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "riskImpact" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "rootCause" TEXT,
    "managementResponse" TEXT,
    "auditorAssessment" TEXT,
    "responsibleOwner" TEXT,
    "targetDate" TIMESTAMP(3),
    "closureEvidence" TEXT,
    "closedAt" TIMESTAMP(3),
    "detectionType" TEXT NOT NULL DEFAULT 'AUTOMATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditFinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditFinding_organizationId_findingRef_key" ON "AuditFinding" ("organizationId", "findingRef");
CREATE INDEX "AuditFinding_organizationId_idx" ON "AuditFinding" ("organizationId");

ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

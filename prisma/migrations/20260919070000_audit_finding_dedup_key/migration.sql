-- Stable identity key for the audit scan's dedup logic — see the schema.prisma comment on why
-- (area, entityLabel, transactionRef) alone isn't specific enough to distinguish two different
-- finding types about the same real-world entity (e.g. an AR aging exception and an AR
-- concentration exception for the same customer).
ALTER TABLE "AuditFinding" ADD COLUMN "dedupKey" TEXT;

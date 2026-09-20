-- XeroConnection moves from one-per-organization to one-per-subsidiary. The table is empty
-- in production (the Xero app has never been configured with real credentials), so this is
-- a safe structural change rather than a data migration.
DROP INDEX "XeroConnection_organizationId_key";

ALTER TABLE "XeroConnection" ADD COLUMN "subsidiaryId" TEXT NOT NULL;

CREATE UNIQUE INDEX "XeroConnection_subsidiaryId_key" ON "XeroConnection"("subsidiaryId");

ALTER TABLE "XeroConnection" ADD CONSTRAINT "XeroConnection_subsidiaryId_fkey" FOREIGN KEY ("subsidiaryId") REFERENCES "Subsidiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "XeroConnection" ADD COLUMN "lastSyncAt" TIMESTAMP(3);
ALTER TABLE "XeroConnection" ADD COLUMN "lastSyncError" TEXT;

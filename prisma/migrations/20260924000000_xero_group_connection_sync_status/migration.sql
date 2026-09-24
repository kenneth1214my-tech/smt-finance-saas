-- AlterTable
ALTER TABLE "XeroGroupConnection" ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncError" TEXT;

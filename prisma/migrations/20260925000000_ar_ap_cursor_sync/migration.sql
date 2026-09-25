-- AlterTable
ALTER TABLE "ARCustomer" ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "syncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payable" ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "syncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "XeroConnection" ADD COLUMN     "arApCycleStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "XeroGroupConnection" ADD COLUMN     "arApCycleStartedAt" TIMESTAMP(3);

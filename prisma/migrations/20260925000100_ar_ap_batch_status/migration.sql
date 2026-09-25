-- AlterTable
ALTER TABLE "XeroConnection" ADD COLUMN     "arApLastBatchAt" TIMESTAMP(3),
ADD COLUMN     "arApLastBatchError" TEXT;

-- AlterTable
ALTER TABLE "XeroGroupConnection" ADD COLUMN     "arApLastBatchAt" TIMESTAMP(3),
ADD COLUMN     "arApLastBatchError" TEXT;

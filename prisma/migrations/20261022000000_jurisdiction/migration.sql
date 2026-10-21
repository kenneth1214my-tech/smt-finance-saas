-- CreateEnum
CREATE TYPE "Jurisdiction" AS ENUM ('SG', 'HK');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "jurisdiction" "Jurisdiction" NOT NULL DEFAULT 'SG',
ADD COLUMN "accountingFramework" TEXT,
ADD COLUMN "incorporationDate" TIMESTAMP(3),
ADD COLUMN "registrationNo" TEXT;

-- AlterTable
ALTER TABLE "CorporateTaxProvision" ADD COLUMN "lowerRateElected" BOOLEAN NOT NULL DEFAULT true;

-- AlterEnum
ALTER TYPE "TaxFilingType" ADD VALUE 'PROFITS_TAX_RETURN';
ALTER TYPE "TaxFilingType" ADD VALUE 'PROVISIONAL_TAX';
ALTER TYPE "TaxFilingType" ADD VALUE 'EMPLOYERS_RETURN';
ALTER TYPE "TaxFilingType" ADD VALUE 'ANNUAL_RETURN';
ALTER TYPE "TaxFilingType" ADD VALUE 'BR_RENEWAL';

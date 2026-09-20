ALTER TABLE "BankAccount" ADD COLUMN "subsidiaryId" TEXT;

ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_subsidiaryId_fkey" FOREIGN KEY ("subsidiaryId") REFERENCES "Subsidiary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

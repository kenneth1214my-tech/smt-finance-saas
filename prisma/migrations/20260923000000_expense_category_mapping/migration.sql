-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('SELLING', 'ADMIN', 'RND', 'FINANCE');

-- CreateTable
CREATE TABLE "ExpenseCategoryMapping" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountLabel" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategoryMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategoryMapping_organizationId_accountLabel_key" ON "ExpenseCategoryMapping"("organizationId", "accountLabel");

-- AddForeignKey
ALTER TABLE "ExpenseCategoryMapping" ADD CONSTRAINT "ExpenseCategoryMapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

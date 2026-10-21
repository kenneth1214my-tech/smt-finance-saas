-- One login can belong to several companies: e-mail is unique per company instead of globally.
DROP INDEX "User_email_key";
CREATE UNIQUE INDEX "User_organizationId_email_key" ON "User"("organizationId", "email");

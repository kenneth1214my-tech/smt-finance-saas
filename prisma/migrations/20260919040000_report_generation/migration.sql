-- Marks which ReportDoc rows the system generated itself (vs. an admin's manual log entry),
-- and lets a generated report be regenerated in place instead of piling up duplicate rows.
-- Postgres doesn't enforce uniqueness across NULLs, so the many pre-existing manually-logged
-- rows (which leave both columns null) are unaffected by this constraint.
ALTER TABLE "ReportDoc" ADD COLUMN "reportKey" TEXT;
ALTER TABLE "ReportDoc" ADD COLUMN "periodYear" INTEGER;

CREATE UNIQUE INDEX "ReportDoc_organizationId_reportKey_periodYear_key" ON "ReportDoc" ("organizationId", "reportKey", "periodYear");
